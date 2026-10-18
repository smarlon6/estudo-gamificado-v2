"""
Regras de gamificação.

Toda a lógica de XP, moedas, ofensiva, revisão e conquistas mora aqui.
As views só chamam estas funções; o front só exibe o resultado.
Os números ficam em settings.JOGO para serem ajustados sem mexer no código.
"""
from dataclasses import dataclass
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import Count, Q, Sum
from django.utils import timezone

from questoes.models import Alternativa, Questao

from .models import (
    Anotacao,
    Conquista,
    ConquistaUsuario,
    MarcoColetado,
    MarcoTrilha,
    NivelMateria,
    Perfil,
    ProgressoDiario,
    Resposta,
    Revisao,
    Transacao,
)

CFG = settings.JOGO


class RegraDoJogoError(Exception):
    """Ação não permitida pelas regras (ex.: coletar recompensa duas vezes)."""


# ---------------------------------------------------------------------------
# Níveis e ligas
# ---------------------------------------------------------------------------
@dataclass
class InfoNivel:
    nivel: int
    xp_no_nivel: int
    xp_para_proximo: int

    @property
    def percentual(self):
        return round(100 * self.xp_no_nivel / self.xp_para_proximo)


def _info_nivel(xp: int, custo_por_nivel: int) -> InfoNivel:
    """Subir do nível n para n+1 custa custo_por_nivel * (n + 1) de XP."""
    nivel = 1
    restante = xp
    while restante >= custo_por_nivel * (nivel + 1):
        restante -= custo_por_nivel * (nivel + 1)
        nivel += 1
    return InfoNivel(nivel, restante, custo_por_nivel * (nivel + 1))


def info_nivel_geral(xp: int) -> InfoNivel:
    return _info_nivel(xp, 200)


def info_nivel_materia(xp: int) -> InfoNivel:
    return _info_nivel(xp, 50)


# (troféus mínimos, nome da liga)
LIGAS = [
    (0, "Bronze III"), (100, "Bronze II"), (200, "Bronze I"),
    (300, "Prata III"), (400, "Prata II"), (500, "Prata I"),
    (600, "Ouro III"), (800, "Ouro II"), (1000, "Ouro I"),
    (1300, "Diamante III"), (1600, "Diamante II"), (1900, "Diamante I"),
    (2300, "Mestre"),
]


def info_liga(trofeus: int) -> dict:
    atual = LIGAS[0]
    proxima = None
    for i, liga in enumerate(LIGAS):
        if trofeus >= liga[0]:
            atual = liga
            proxima = LIGAS[i + 1] if i + 1 < len(LIGAS) else None
    return {
        "nome": atual[1],
        "trofeus_minimos": atual[0],
        "proxima_liga": proxima[1] if proxima else None,
        "trofeus_proxima": proxima[0] if proxima else None,
        "faltam": (proxima[0] - trofeus) if proxima else 0,
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def obter_perfil(usuario) -> Perfil:
    perfil, _ = Perfil.objects.get_or_create(usuario=usuario)
    return perfil


def obter_progresso_hoje(usuario) -> ProgressoDiario:
    progresso, _ = ProgressoDiario.objects.get_or_create(
        usuario=usuario, data=timezone.localdate()
    )
    return progresso


def creditar(perfil: Perfil, moeda: str, quantidade: int, motivo: str) -> int:
    """Soma (ou subtrai) uma moeda do perfil, sem deixar negativo, e registra no extrato."""
    atual = getattr(perfil, moeda)
    novo = max(0, atual + quantidade)
    delta = novo - atual
    if delta:
        setattr(perfil, moeda, novo)
        Transacao.objects.create(
            usuario=perfil.usuario, moeda=moeda, quantidade=delta, motivo=motivo
        )
    return delta


def ofensiva_vigente(perfil: Perfil) -> int:
    """A ofensiva exibida zera se o último dia com meta já passou (considerando congeladores)."""
    if not perfil.ultimo_dia_meta:
        return 0
    dias_sem_meta = (timezone.localdate() - perfil.ultimo_dia_meta).days - 1
    if dias_sem_meta <= 0:
        return perfil.ofensiva_atual
    if dias_sem_meta <= perfil.congeladores:
        return perfil.ofensiva_atual
    return 0


def _atualizar_ofensiva(perfil: Perfil):
    hoje = timezone.localdate()
    ultimo = perfil.ultimo_dia_meta
    if ultimo == hoje:
        return
    dias_sem_meta = (hoje - ultimo).days - 1 if ultimo else None
    if dias_sem_meta == 0:
        perfil.ofensiva_atual += 1
    elif dias_sem_meta is not None and 0 < dias_sem_meta <= perfil.congeladores:
        perfil.congeladores -= dias_sem_meta
        perfil.ofensiva_atual += 1
    else:
        perfil.ofensiva_atual = 1
    perfil.ofensiva_recorde = max(perfil.ofensiva_recorde, perfil.ofensiva_atual)
    perfil.ultimo_dia_meta = hoje


# ---------------------------------------------------------------------------
# Responder questão (o coração do jogo)
# ---------------------------------------------------------------------------
@transaction.atomic
def registrar_resposta(usuario, questao: Questao, alternativa: Alternativa,
                       tempo_segundos: int = 0, modo: str = Resposta.Modo.TREINO) -> dict:
    if alternativa.questao_id != questao.id:
        raise RegraDoJogoError("Alternativa não pertence a esta questão.")
    if questao.status != Questao.Status.ATIVA:
        raise RegraDoJogoError("Questão não está ativa.")

    perfil = Perfil.objects.select_for_update().get_or_create(usuario=usuario)[0]
    hoje = timezone.localdate()
    correta = alternativa.correta

    anteriores = Resposta.objects.filter(usuario=usuario, questao=questao)
    primeira_tentativa = not anteriores.exists()
    ja_acertou = anteriores.filter(correta=True).exists()
    revisao = Revisao.objects.filter(usuario=usuario, questao=questao, concluida=False).first()
    revisao_liberada = bool(revisao and revisao_disponivel(revisao))
    # reforço do mesmo dia (minutos depois do erro) não conta como revisão "de verdade":
    # sem troféus e com XP de repetição, senão errar de propósito viraria farm
    em_reforco = bool(revisao_liberada and revisao.intervalo_dias == 0)
    revisao_vencida = revisao_liberada and not em_reforco
    nivel_antes = info_nivel_geral(perfil.xp_total).nivel

    # --- XP ---
    detalhe_xp = {"base": 0, "combo": 0, "fator": 1.0, "motivos": []}
    if correta:
        base = CFG["XP_POR_DIFICULDADE"].get(questao.dificuldade, 10)
        bonus_combo = min(perfil.combo_atual, CFG["XP_COMBO_MAX"])
        fator = 1.0
        if (ja_acertou and not revisao_vencida) or em_reforco:
            fator *= CFG["FATOR_XP_REPETIDA"]
            detalhe_xp["motivos"].append("reforço da questão errada" if em_reforco else "questão já acertada antes")
        if tempo_segundos < CFG["TEMPO_MINIMO_SEGUNDOS"]:
            fator *= 0.5
            detalhe_xp["motivos"].append("resposta rápida demais")
        xp = round((base + bonus_combo) * fator)
        detalhe_xp.update(base=base, combo=bonus_combo, fator=fator)
        perfil.combo_atual += 1
        perfil.melhor_combo = max(perfil.melhor_combo, perfil.combo_atual)
    else:
        xp = 0
        perfil.combo_atual = 0

    perfil.xp_total += xp

    # --- Troféus (só contam na primeira tentativa ou numa revisão vencida: anti-farm) ---
    trofeus_delta = 0
    if primeira_tentativa or revisao_vencida:
        delta_previsto = CFG["TROFEUS_ACERTO"] if correta else CFG["TROFEUS_ERRO"]
        trofeus_delta = creditar(perfil, "trofeus", delta_previsto,
                                 "Acerto" if correta else "Erro")

    # --- Nível da matéria ---
    nivel_mat, _ = NivelMateria.objects.select_for_update().get_or_create(
        usuario=usuario, materia=questao.materia
    )
    nivel_mat_antes = info_nivel_materia(nivel_mat.xp).nivel
    nivel_mat.xp += xp
    nivel_mat.save()

    # --- Progresso do dia e meta ---
    progresso, _ = ProgressoDiario.objects.select_for_update().get_or_create(
        usuario=usuario, data=hoje
    )
    progresso.respondidas += 1
    progresso.acertos += int(correta)
    progresso.xp_ganho += xp
    progresso.tempo_total_segundos += tempo_segundos
    meta_concluida_agora = False
    if not progresso.meta_concluida and progresso.respondidas >= perfil.meta_diaria:
        progresso.meta_concluida = True
        meta_concluida_agora = True
        _atualizar_ofensiva(perfil)
    progresso.save()

    # --- Revisão espaçada (adaptativa) ---
    info_revisao = _atualizar_revisao(usuario, questao, revisao, correta, revisao_liberada, tempo_segundos)

    resposta = Resposta.objects.create(
        usuario=usuario, questao=questao, alternativa=alternativa, correta=correta,
        modo=modo, tempo_segundos=tempo_segundos, xp_ganho=xp,
        trofeus_delta=trofeus_delta, primeira_tentativa=primeira_tentativa,
    )

    perfil.save()
    conquistas_novas = verificar_conquistas(perfil)

    nivel_depois = info_nivel_geral(perfil.xp_total)
    correta_obj = questao.alternativa_correta
    return {
        "resposta_id": resposta.id,
        "correta": correta,
        "alternativa_correta_id": correta_obj.id if correta_obj else None,
        "explicacao": questao.explicacao,
        "xp_ganho": xp,
        "detalhe_xp": detalhe_xp,
        "combo": perfil.combo_atual,
        "trofeus_delta": trofeus_delta,
        "subiu_nivel": nivel_depois.nivel > nivel_antes,
        "nivel": nivel_depois.nivel,
        "subiu_nivel_materia": info_nivel_materia(nivel_mat.xp).nivel > nivel_mat_antes,
        "meta_concluida_agora": meta_concluida_agora,
        "progresso_hoje": {
            "respondidas": progresso.respondidas,
            "meta": perfil.meta_diaria,
        },
        "conquistas_novas": conquistas_novas,
        "revisao": info_revisao,
    }


# ---------------------------------------------------------------------------
# Revisão espaçada adaptativa (estilo Anki simplificado)
# ---------------------------------------------------------------------------
REV = CFG["REVISAO"]


def revisao_disponivel(revisao: Revisao, agora=None) -> bool:
    """Venceu a data e, se for reforço do mesmo dia, já passaram os minutos de espera."""
    agora = agora or timezone.now()
    return (
        not revisao.concluida
        and revisao.proxima_em <= timezone.localdate()
        and (revisao.liberada_em is None or revisao.liberada_em <= agora)
    )


def revisoes_disponiveis(usuario):
    agora = timezone.now()
    return Revisao.objects.filter(
        usuario=usuario, concluida=False, proxima_em__lte=timezone.localdate()
    ).filter(Q(liberada_em__isnull=True) | Q(liberada_em__lte=agora))


def _tempo_medio_acertos(usuario, materia_id) -> float:
    from django.db.models import Avg

    media = (
        Resposta.objects.filter(usuario=usuario, correta=True, questao__materia_id=materia_id)
        .aggregate(m=Avg("tempo_segundos"))["m"]
    )
    if not media:
        media = Resposta.objects.filter(usuario=usuario, correta=True).aggregate(m=Avg("tempo_segundos"))["m"]
    return float(media or 0)


def _data_br(d) -> str:
    return d.strftime("%d/%m")


def _atualizar_revisao(usuario, questao, revisao, correta, liberada, tempo_segundos) -> dict | None:
    """
    Regras:
      - Errou: volta em ~10 min (reforço), a facilidade cai e conta um lapso.
      - Acertou o reforço: próxima revisão amanhã.
      - Acertou uma revisão vencida: intervalo = intervalo anterior x facilidade
        (maior se respondeu rápido, menor se demorou). Passou de 60 dias: aprendida.
      - Teimosa (3+ lapsos): o intervalo nunca passa de 7 dias.
      - Acertou antes do prazo: nada muda.
    """
    import math

    hoje = timezone.localdate()
    agora = timezone.now()

    if not correta:
        if revisao is None:
            revisao = Revisao.objects.filter(usuario=usuario, questao=questao).first()
        if revisao is None:
            revisao = Revisao(usuario=usuario, questao=questao, facilidade=REV["facilidade_inicial"])
        else:
            revisao.lapsos += 1
            revisao.facilidade = max(REV["facilidade_min"], revisao.facilidade - REV["penalidade_erro"])
        revisao.etapa = 0
        revisao.intervalo_dias = 0
        revisao.concluida = False
        revisao.proxima_em = hoje
        revisao.liberada_em = agora + timedelta(minutes=REV["reforco_minutos"])
        revisao.save()
        teimosa = revisao.lapsos + 1 >= REV["teimosa_lapsos"]
        msg = f"Ela volta daqui a ~{REV['reforco_minutos']} minutos para um reforço rápido."
        if teimosa:
            msg += " Essa já é teimosa: vale anotar o porquê do erro."
        return {"status": "reforco", "dias": 0, "proxima_em": hoje.isoformat(), "teimosa": teimosa, "mensagem": msg}

    if revisao is None:
        return None
    if not liberada:
        return {"status": "mantida", "dias": (revisao.proxima_em - hoje).days, "proxima_em": revisao.proxima_em.isoformat(),
                "teimosa": revisao.lapsos + 1 >= REV["teimosa_lapsos"],
                "mensagem": f"Revisão desta questão continua marcada para {_data_br(revisao.proxima_em)}."}

    teimosa = revisao.lapsos + 1 >= REV["teimosa_lapsos"]
    ritmo = ""
    if revisao.intervalo_dias == 0:
        novo = 1
        msg_base = "Reforço feito!"
    else:
        mult = 1.0
        media = _tempo_medio_acertos(usuario, questao.materia_id)
        if media and tempo_segundos >= REV["minimo_segundos_para_ritmo"]:
            if tempo_segundos <= media * REV["rapido"]:
                mult, ritmo = REV["bonus_rapido"], "rapido"
                revisao.facilidade = min(REV["facilidade_max"], revisao.facilidade + REV["ajuste_rapido"])
            elif tempo_segundos >= media * REV["lento"]:
                mult, ritmo = REV["fator_lento"], "lento"
                revisao.facilidade = max(REV["facilidade_min"], revisao.facilidade - REV["ajuste_lento"])
        novo = max(revisao.intervalo_dias + 1, math.ceil(revisao.intervalo_dias * revisao.facilidade * mult))
        msg_base = "Revisão certa!"
    if teimosa:
        novo = min(novo, REV["teimosa_max_dias"])

    revisao.etapa += 1
    revisao.liberada_em = None
    if novo > REV["aprendida_apos_dias"] and not teimosa:
        revisao.concluida = True
        revisao.intervalo_dias = novo
        revisao.save()
        return {"status": "aprendida", "dias": None, "proxima_em": None, "teimosa": False,
                "mensagem": "Questão aprendida! Ela saiu da sua revisão."}

    revisao.intervalo_dias = novo
    revisao.proxima_em = hoje + timedelta(days=novo)
    revisao.save()
    quando = "amanhã" if novo == 1 else f"em {novo} dias ({_data_br(revisao.proxima_em)})"
    extra = {"rapido": " Rápido e certeiro: intervalo maior.", "lento": " Acertou, mas demorou: intervalo menor."}.get(ritmo, "")
    if teimosa:
        extra += " Questão teimosa: intervalo limitado a 7 dias."
    return {"status": "agendada", "dias": novo, "proxima_em": revisao.proxima_em.isoformat(), "teimosa": teimosa,
            "mensagem": f"{msg_base} Próxima revisão {quando}.{extra}"}


# ---------------------------------------------------------------------------
# Recompensas
# ---------------------------------------------------------------------------
@transaction.atomic
def coletar_recompensa_meta(usuario) -> dict:
    perfil = Perfil.objects.select_for_update().get_or_create(usuario=usuario)[0]
    progresso = ProgressoDiario.objects.select_for_update().filter(
        usuario=usuario, data=timezone.localdate()
    ).first()
    if not progresso or not progresso.meta_concluida:
        raise RegraDoJogoError("A meta de hoje ainda não foi concluída.")
    if progresso.recompensa_coletada:
        raise RegraDoJogoError("A recompensa de hoje já foi coletada.")

    premio = CFG["RECOMPENSA_META"]
    for moeda, qtd in premio.items():
        creditar(perfil, moeda, qtd, "Meta diária")
    progresso.recompensa_coletada = True
    progresso.save()
    perfil.save()
    conquistas = verificar_conquistas(perfil)
    return {"recompensa": premio, "conquistas_novas": conquistas}


@transaction.atomic
def coletar_marco(usuario, marco_id: int) -> dict:
    perfil = Perfil.objects.select_for_update().get_or_create(usuario=usuario)[0]
    marco = MarcoTrilha.objects.get(pk=marco_id)
    if perfil.trofeus < marco.trofeus:
        raise RegraDoJogoError("Troféus insuficientes para este marco.")
    _, criado = MarcoColetado.objects.get_or_create(usuario=usuario, marco=marco)
    if not criado:
        raise RegraDoJogoError("Este marco já foi coletado.")
    creditar(perfil, "ouro", marco.recompensa_ouro, f"Trilha: {marco.titulo}")
    creditar(perfil, "diamantes", marco.recompensa_diamantes, f"Trilha: {marco.titulo}")
    perfil.save()
    return {"ouro": marco.recompensa_ouro, "diamantes": marco.recompensa_diamantes}


@transaction.atomic
def salvar_anotacao(usuario, questao: Questao, texto: str) -> dict:
    texto = (texto or "").strip()
    if not texto:
        raise RegraDoJogoError("A anotação está vazia.")
    _, criada = Anotacao.objects.update_or_create(
        usuario=usuario, questao=questao, defaults={"texto": texto}
    )
    ouro = 0
    if criada:
        perfil = Perfil.objects.select_for_update().get_or_create(usuario=usuario)[0]
        ouro = creditar(perfil, "ouro", CFG["OURO_POR_ANOTACAO"], "Anotação")
        perfil.save()
    return {"criada": criada, "ouro_ganho": ouro}


def verificar_conquistas(perfil: Perfil) -> list[dict]:
    """Concede conquistas cujo critério foi atingido. Retorna as novas."""
    usuario = perfil.usuario
    obtidas = set(
        ConquistaUsuario.objects.filter(usuario=usuario).values_list("conquista_id", flat=True)
    )
    pendentes = Conquista.objects.exclude(id__in=obtidas)
    if not pendentes:
        return []

    valores = {
        Conquista.Criterio.TOTAL_RESPOSTAS: Resposta.objects.filter(usuario=usuario).count(),
        Conquista.Criterio.OFENSIVA: perfil.ofensiva_recorde,
        Conquista.Criterio.COMBO: perfil.melhor_combo,
        Conquista.Criterio.NIVEL: info_nivel_geral(perfil.xp_total).nivel,
    }
    novas = []
    for c in pendentes:
        if valores.get(c.criterio, 0) >= c.valor_alvo:
            ConquistaUsuario.objects.create(usuario=usuario, conquista=c)
            creditar(perfil, "ouro", c.recompensa_ouro, f"Conquista: {c.nome}")
            creditar(perfil, "diamantes", c.recompensa_diamantes, f"Conquista: {c.nome}")
            novas.append({"codigo": c.codigo, "nome": c.nome, "icone": c.icone,
                          "ouro": c.recompensa_ouro, "diamantes": c.recompensa_diamantes})
    if novas:
        perfil.save()
    return novas


# ---------------------------------------------------------------------------
# Seleção de questões
# ---------------------------------------------------------------------------
def proxima_questao(usuario, modo: str = "treino", materia=None, assunto=None,
                    banca=None, excluir_ids=None) -> Questao | None:
    base = Questao.objects.filter(status=Questao.Status.ATIVA)
    if materia:
        base = base.filter(materia__slug=materia) if not str(materia).isdigit() \
            else base.filter(materia_id=materia)
    if assunto:
        base = base.filter(assunto_id=assunto)
    if banca:
        base = base.filter(banca_id=banca)
    # para revisões, só a questão que acabou de aparecer fica de fora (as outras "vistas" podem voltar)
    base_revisao = base.exclude(id=excluir_ids[-1]) if excluir_ids else base
    if excluir_ids:
        base = base.exclude(id__in=excluir_ids)

    def proxima_revisao():
        pendentes = revisoes_disponiveis(usuario).order_by("proxima_em", "liberada_em")
        for questao_id in pendentes.values_list("questao_id", flat=True):
            q = base_revisao.filter(id=questao_id).first()
            if q:
                return q
        return None

    if modo == Resposta.Modo.REVISAO:
        return proxima_revisao()

    if modo == Resposta.Modo.MISSAO:
        # a cada N questões do dia, uma é revisão liberada (a mais atrasada primeiro)
        feitas_hoje = ProgressoDiario.objects.filter(usuario=usuario, data=timezone.localdate()).values_list(
            "respondidas", flat=True).first() or 0
        if (feitas_hoje + 1) % REV["missao_revisao_a_cada"] == 0 and not materia:
            q = proxima_revisao()
            if q:
                return q
        # Missão diária: prioriza a matéria com pior % de acerto.
        pior = materia_mais_fraca(usuario)
        if pior and not materia:
            candidata = _inedita_ou_qualquer(usuario, base.filter(materia_id=pior))
            if candidata:
                return candidata

    return _inedita_ou_qualquer(usuario, base)


def _inedita_ou_qualquer(usuario, qs):
    respondidas = Resposta.objects.filter(usuario=usuario).values_list("questao_id", flat=True)
    return qs.exclude(id__in=respondidas).order_by("?").first() or qs.order_by("?").first()


def materia_mais_fraca(usuario):
    linhas = (
        Resposta.objects.filter(usuario=usuario)
        .values("questao__materia_id")
        .annotate(total=Count("id"), acertos=Count("id", filter=Q(correta=True)))
        .filter(total__gte=5)
    )
    pior = min(linhas, key=lambda r: r["acertos"] / r["total"], default=None)
    return pior["questao__materia_id"] if pior else None


# ---------------------------------------------------------------------------
# Estatísticas
# ---------------------------------------------------------------------------
def estatisticas(usuario) -> dict:
    respostas = Resposta.objects.filter(usuario=usuario)
    total = respostas.count()
    acertos = respostas.filter(correta=True).count()

    por_materia = []
    niveis = {n.materia_id: n.xp for n in NivelMateria.objects.filter(usuario=usuario)}
    for linha in (
        respostas.values("questao__materia_id", "questao__materia__nome", "questao__materia__cor")
        .annotate(total=Count("id"), acertos=Count("id", filter=Q(correta=True)))
        .order_by("questao__materia__nome")
    ):
        xp = niveis.get(linha["questao__materia_id"], 0)
        por_materia.append({
            "materia_id": linha["questao__materia_id"],
            "materia": linha["questao__materia__nome"],
            "cor": linha["questao__materia__cor"],
            "respondidas": linha["total"],
            "acertos": linha["acertos"],
            "percentual": round(100 * linha["acertos"] / linha["total"]),
            "nivel": info_nivel_materia(xp).nivel,
        })

    pontos_fracos = sorted(
        (
            {
                "assunto_id": l["questao__assunto_id"],
                "assunto": l["questao__assunto__nome"],
                "materia": l["questao__materia__nome"],
                "respondidas": l["total"],
                "percentual": round(100 * l["acertos"] / l["total"]),
            }
            for l in respostas.exclude(questao__assunto=None)
            .values("questao__assunto_id", "questao__assunto__nome", "questao__materia__nome")
            .annotate(total=Count("id"), acertos=Count("id", filter=Q(correta=True)))
            .filter(total__gte=5)
        ),
        key=lambda x: x["percentual"],
    )[:5]

    return {
        "total_respondidas": total,
        "total_acertos": acertos,
        "percentual_geral": round(100 * acertos / total) if total else 0,
        "por_materia": por_materia,
        "pontos_fracos": [p for p in pontos_fracos if p["percentual"] < 70],
        "comparativo_semanal": comparativo_semanal(usuario),
    }


def _resumo_periodo(usuario, inicio, fim) -> dict:
    agg = ProgressoDiario.objects.filter(
        usuario=usuario, data__gte=inicio, data__lte=fim
    ).aggregate(r=Sum("respondidas"), a=Sum("acertos"), t=Sum("tempo_total_segundos"))
    r, a, t = agg["r"] or 0, agg["a"] or 0, agg["t"] or 0
    return {
        "respondidas": r,
        "percentual": round(100 * a / r) if r else 0,
        "tempo_medio": round(t / r) if r else 0,
    }


def comparativo_semanal(usuario) -> dict:
    """'Você vs. você da semana passada': últimos 7 dias contra os 7 anteriores."""
    hoje = timezone.localdate()
    return {
        "esta_semana": _resumo_periodo(usuario, hoje - timedelta(days=6), hoje),
        "semana_passada": _resumo_periodo(
            usuario, hoje - timedelta(days=13), hoje - timedelta(days=7)
        ),
    }


# ---------------------------------------------------------------------------
# Histórico (usado pelo front web: calendário de ofensiva, gráfico semanal, tendências)
# ---------------------------------------------------------------------------
def historico(usuario, dias: int = 182, semanas: int = 12) -> dict:
    from django.db.models import Avg

    hoje = timezone.localdate()

    # 1) Atividade por dia (calendário estilo GitHub), com zeros nos dias sem estudo
    inicio = hoje - timedelta(days=dias - 1)
    por_dia = {
        p.data: p for p in ProgressoDiario.objects.filter(usuario=usuario, data__gte=inicio, data__lte=hoje)
    }
    lista_dias = []
    for i in range(dias):
        d = inicio + timedelta(days=i)
        p = por_dia.get(d)
        lista_dias.append({
            "data": d.isoformat(),
            "respondidas": p.respondidas if p else 0,
            "acertos": p.acertos if p else 0,
            "meta_concluida": bool(p and p.meta_concluida),
        })

    # 2) % de acerto por semana (janelas de 7 dias terminando hoje)
    lista_semanas = []
    for k in range(semanas - 1, -1, -1):
        fim = hoje - timedelta(days=7 * k)
        ini = fim - timedelta(days=6)
        r = _resumo_periodo(usuario, ini, fim)
        lista_semanas.append({"inicio": ini.isoformat(), "fim": fim.isoformat(), **r})

    # 3) Tendência por matéria: acerto nos últimos 30 dias vs. 30 dias anteriores
    agora = timezone.now()

    def pct_por_materia(de, ate):
        linhas = (
            Resposta.objects.filter(usuario=usuario, respondida_em__gte=de, respondida_em__lt=ate)
            .values("questao__materia_id")
            .annotate(total=Count("id"), acertos=Count("id", filter=Q(correta=True)))
        )
        return {l["questao__materia_id"]: (100 * l["acertos"] / l["total"], l["total"]) for l in linhas}

    atual = pct_por_materia(agora - timedelta(days=30), agora + timedelta(seconds=1))
    anterior = pct_por_materia(agora - timedelta(days=60), agora - timedelta(days=30))
    tendencias = []
    for materia_id, (pct, total) in atual.items():
        if materia_id in anterior and anterior[materia_id][1] >= 5 and total >= 5:
            tendencias.append({"materia_id": materia_id, "delta": round(pct - anterior[materia_id][0])})
        else:
            tendencias.append({"materia_id": materia_id, "delta": None})

    respostas = Resposta.objects.filter(usuario=usuario)
    tempo_medio = respostas.aggregate(m=Avg("tempo_segundos"))["m"] or 0
    obtidas = set(ConquistaUsuario.objects.filter(usuario=usuario).values_list("conquista_id", flat=True))

    return {
        "dias": lista_dias,
        "dias_com_estudo": sum(1 for d in lista_dias if d["respondidas"]),
        "questoes_no_periodo": sum(d["respondidas"] for d in lista_dias),
        "semanas": lista_semanas,
        "tendencias": tendencias,
        "tempo_medio_segundos": round(tempo_medio),
        "conquistas": [
            {"codigo": c.codigo, "nome": c.nome, "descricao": c.descricao, "icone": c.icone,
             "obtida": c.id in obtidas}
            for c in Conquista.objects.all()
        ],
    }
