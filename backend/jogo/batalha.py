"""
Modo Batalha.

Cada acerto tira 1 de vida do inimigo (ele tem `Inimigo.vida`, padrão 20 = 20 acertos para vencer).
Cada erro tira 1 da sua vida (`JOGO["BATALHA"]["vidas_jogador"]`, padrão 5).
A resposta continua passando pelo fluxo normal (XP, troféus, revisão, meta diária);
aqui só se soma a parte da batalha.
"""
from __future__ import annotations

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from . import services as s
from .models import Batalha, Inimigo, Resposta

CFG = settings.JOGO["BATALHA"]


def _pct(atual: int, maximo: int) -> int:
    return round(100 * atual / maximo) if maximo else 0


def estado(b: Batalha) -> dict:
    return {
        "id": b.id,
        "status": b.status,
        "inimigo": {"slug": b.inimigo.slug, "nome": b.inimigo.nome, "descricao": b.inimigo.descricao},
        "vida_inimigo": b.vida_inimigo,
        "vida_inimigo_max": b.vida_inimigo_max,
        "vida_inimigo_pct": _pct(b.vida_inimigo, b.vida_inimigo_max),
        "vida_jogador": b.vida_jogador,
        "vida_jogador_max": b.vida_jogador_max,
        "vida_jogador_pct": _pct(b.vida_jogador, b.vida_jogador_max),
        "acertos": b.acertos,
        "erros": b.erros,
        "respondidas": b.acertos + b.erros,
        "sequencia": b.sequencia,
        "melhor_sequencia": b.melhor_sequencia,
        "recompensa": {"ouro": b.ouro_ganho, "diamantes": b.diamantes_ganhos, "trofeus": b.trofeus_ganhos},
        "iniciada_em": b.iniciada_em.isoformat(),
    }


def batalha_atual(usuario) -> Batalha | None:
    return (Batalha.objects.select_related("inimigo")
            .filter(usuario=usuario, status=Batalha.Status.ANDAMENTO).first())


def resumo(usuario) -> dict:
    atual = batalha_atual(usuario)
    feitas = Batalha.objects.filter(usuario=usuario)
    return {
        "atual": estado(atual) if atual else None,
        "inimigos": [
            {"slug": i.slug, "nome": i.nome, "descricao": i.descricao, "vida": i.vida,
             "recompensa_ouro": i.recompensa_ouro, "recompensa_diamantes": i.recompensa_diamantes,
             "vitorias": feitas.filter(inimigo=i, status=Batalha.Status.VITORIA).count()}
            for i in Inimigo.objects.filter(ativo=True)
        ],
        "vitorias": feitas.filter(status=Batalha.Status.VITORIA).count(),
        "derrotas": feitas.filter(status=Batalha.Status.DERROTA).count(),
        "vidas_jogador": CFG["vidas_jogador"],
    }


def iniciar(usuario, slug: str | None = None) -> Batalha:
    """Começa uma batalha. Se já houver uma em andamento, devolve ela (não cria duas)."""
    atual = batalha_atual(usuario)
    if atual:
        return atual
    inimigos = Inimigo.objects.filter(ativo=True)
    inimigo = inimigos.filter(slug=slug).first() if slug else inimigos.first()
    if not inimigo:
        raise s.RegraDoJogoError("Nenhum inimigo disponível para batalhar.")
    return Batalha.objects.create(
        usuario=usuario, inimigo=inimigo,
        vida_inimigo_max=inimigo.vida, vida_inimigo=inimigo.vida,
        vida_jogador_max=CFG["vidas_jogador"], vida_jogador=CFG["vidas_jogador"],
    )


def desistir(usuario) -> Batalha | None:
    b = batalha_atual(usuario)
    if b:
        b.status = Batalha.Status.DESISTENCIA
        b.finalizada_em = timezone.now()
        b.save()
    return b


@transaction.atomic
def responder(usuario, questao, alternativa, tempo_segundos: int) -> dict:
    b = (Batalha.objects.select_for_update().select_related("inimigo")
         .filter(usuario=usuario, status=Batalha.Status.ANDAMENTO).first())
    if not b:
        raise s.RegraDoJogoError("Você não tem uma batalha em andamento.")

    resultado = s.registrar_resposta(usuario, questao, alternativa, tempo_segundos, Resposta.Modo.BATALHA)

    if resultado["correta"]:
        b.vida_inimigo = max(0, b.vida_inimigo - 1)
        b.acertos += 1
        b.sequencia += 1
        b.melhor_sequencia = max(b.melhor_sequencia, b.sequencia)
        evento = "ataque"
    else:
        b.vida_jogador = max(0, b.vida_jogador - 1)
        b.erros += 1
        b.sequencia = 0
        evento = "dano"

    if b.vida_inimigo == 0:
        b.status = Batalha.Status.VITORIA
        evento = "vitoria"
        perfil = s.obter_perfil(usuario)
        motivo = f"Vitória contra {b.inimigo.nome}"
        b.ouro_ganho = s.creditar(perfil, "ouro", b.inimigo.recompensa_ouro, motivo)
        b.diamantes_ganhos = s.creditar(perfil, "diamantes", b.inimigo.recompensa_diamantes, motivo)
        b.trofeus_ganhos = s.creditar(perfil, "trofeus", CFG["trofeus_vitoria"], motivo)
        perfil.save()
    elif b.vida_jogador == 0:
        b.status = Batalha.Status.DERROTA
        evento = "derrota"
    if b.status != Batalha.Status.ANDAMENTO:
        b.finalizada_em = timezone.now()
    b.save()

    return {"resultado": resultado, "batalha": estado(b), "evento": evento}
