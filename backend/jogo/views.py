from django.contrib.auth import authenticate, login, logout
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response as R

from questoes.models import Alternativa, Banca, Materia, Questao
from questoes.serializers import BancaSerializer, MateriaSerializer, QuestaoPublicaSerializer

from . import services as s
from .models import ConquistaUsuario, MarcoColetado, MarcoTrilha, NivelMateria, Resposta, Revisao


def _erro(exc):
    return R({"erro": str(exc)}, status=status.HTTP_400_BAD_REQUEST)


# ---------------------------------------------------------------------------
# Autenticação por sessão
# ---------------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([AllowAny])
@ensure_csrf_cookie
def csrf(request):
    """Chamado uma vez pelo front para receber o cookie csrftoken."""
    return R({"ok": True})


@api_view(["POST"])
@permission_classes([AllowAny])
def entrar(request):
    usuario = authenticate(
        request,
        username=request.data.get("usuario"),
        password=request.data.get("senha"),
    )
    if not usuario:
        return R({"erro": "Usuário ou senha inválidos."}, status=status.HTTP_400_BAD_REQUEST)
    login(request, usuario)
    return R({"usuario": usuario.get_username()})


@api_view(["POST"])
def sair(request):
    logout(request)
    return R({"ok": True})


@api_view(["GET"])
@permission_classes([AllowAny])
def eu(request):
    if not request.user.is_authenticated:
        return R({"autenticado": False})
    return R({"autenticado": True, "usuario": request.user.get_username()})


# ---------------------------------------------------------------------------
# Painel (tela Início)
# ---------------------------------------------------------------------------
@api_view(["GET"])
def painel(request):
    usuario = request.user
    perfil = s.obter_perfil(usuario)
    nivel = s.info_nivel_geral(perfil.xp_total)
    progresso = s.obter_progresso_hoje(usuario)

    niveis = {n.materia_id: n.xp for n in NivelMateria.objects.filter(usuario=usuario)}
    materias = []
    for m in Materia.objects.all():
        info = s.info_nivel_materia(niveis.get(m.id, 0))
        materias.append({"id": m.id, "nome": m.nome, "slug": m.slug, "cor": m.cor,
                         "nivel": info.nivel, "percentual_nivel": info.percentual})

    return R({
        "usuario": usuario.first_name or usuario.get_username(),
        "nivel": {"nivel": nivel.nivel, "xp_no_nivel": nivel.xp_no_nivel,
                  "xp_para_proximo": nivel.xp_para_proximo, "percentual": nivel.percentual},
        "recursos": {"ouro": perfil.ouro, "diamantes": perfil.diamantes,
                     "trofeus": perfil.trofeus, "ofensiva": s.ofensiva_vigente(perfil),
                     "ofensiva_recorde": perfil.ofensiva_recorde,
                     "congeladores": perfil.congeladores},
        "liga": s.info_liga(perfil.trofeus),
        "meta": {"respondidas": progresso.respondidas, "meta": perfil.meta_diaria,
                 "acertos": progresso.acertos, "concluida": progresso.meta_concluida,
                 "coletada": progresso.recompensa_coletada,
                 "recompensa": s.CFG["RECOMPENSA_META"]},
        "revisoes_pendentes": s.revisoes_disponiveis(usuario).count(),
        "combo": perfil.combo_atual,
        "materias": materias,
    })


# ---------------------------------------------------------------------------
# Catálogo
# ---------------------------------------------------------------------------
@api_view(["GET"])
def materias(request):
    qs = Materia.objects.prefetch_related("assuntos").annotate(
        total_questoes=Count("questoes", filter=Q(questoes__status=Questao.Status.ATIVA))
    )
    return R(MateriaSerializer(qs, many=True).data)


@api_view(["GET"])
def bancas(request):
    return R(BancaSerializer(Banca.objects.all(), many=True).data)


# ---------------------------------------------------------------------------
# Questões
# ---------------------------------------------------------------------------
@api_view(["GET"])
def proxima_questao(request):
    p = request.query_params
    excluir = [int(x) for x in p.get("excluir", "").split(",") if x.isdigit()]
    questao = s.proxima_questao(
        request.user, modo=p.get("modo", "treino"), materia=p.get("materia"),
        assunto=p.get("assunto"), banca=p.get("banca"), excluir_ids=excluir,
    )
    if not questao:
        return R({"questao": None, "mensagem": "Nenhuma questão encontrada com esses filtros."})
    return R({"questao": QuestaoPublicaSerializer(questao).data})


@api_view(["POST"])
def responder(request, questao_id):
    questao = get_object_or_404(Questao, pk=questao_id)
    alternativa = get_object_or_404(Alternativa, pk=request.data.get("alternativa_id"))
    modo = request.data.get("modo", Resposta.Modo.TREINO)
    if modo not in Resposta.Modo.values:
        modo = Resposta.Modo.TREINO
    try:
        tempo = max(0, int(request.data.get("tempo_segundos", 0)))
        resultado = s.registrar_resposta(request.user, questao, alternativa, tempo, modo)
    except (s.RegraDoJogoError, ValueError) as exc:
        return _erro(exc)
    return R(resultado)


@api_view(["POST"])
def anotar(request, questao_id):
    questao = get_object_or_404(Questao, pk=questao_id)
    try:
        return R(s.salvar_anotacao(request.user, questao, request.data.get("texto")))
    except s.RegraDoJogoError as exc:
        return _erro(exc)


# ---------------------------------------------------------------------------
# Recompensas
# ---------------------------------------------------------------------------
@api_view(["POST"])
def coletar_meta(request):
    try:
        return R(s.coletar_recompensa_meta(request.user))
    except s.RegraDoJogoError as exc:
        return _erro(exc)


@api_view(["GET"])
def trilha(request):
    perfil = s.obter_perfil(request.user)
    coletados = set(
        MarcoColetado.objects.filter(usuario=request.user).values_list("marco_id", flat=True)
    )
    marcos = [
        {"id": m.id, "trofeus": m.trofeus, "titulo": m.titulo,
         "ouro": m.recompensa_ouro, "diamantes": m.recompensa_diamantes,
         "estado": "coletado" if m.id in coletados
                   else "disponivel" if perfil.trofeus >= m.trofeus else "bloqueado"}
        for m in MarcoTrilha.objects.all()
    ]
    return R({"trofeus": perfil.trofeus, "liga": s.info_liga(perfil.trofeus), "marcos": marcos,
              "comparativo_semanal": s.comparativo_semanal(request.user)})


@api_view(["POST"])
def coletar_marco(request, marco_id):
    get_object_or_404(MarcoTrilha, pk=marco_id)
    try:
        return R(s.coletar_marco(request.user, marco_id))
    except s.RegraDoJogoError as exc:
        return _erro(exc)


# ---------------------------------------------------------------------------
# Estatísticas e perfil
# ---------------------------------------------------------------------------
@api_view(["GET"])
def estatisticas(request):
    dados = s.estatisticas(request.user)
    perfil = s.obter_perfil(request.user)
    dados["recordes"] = {"ofensiva": perfil.ofensiva_recorde, "combo": perfil.melhor_combo}
    dados["conquistas"] = [
        {"codigo": c.conquista.codigo, "nome": c.conquista.nome,
         "icone": c.conquista.icone, "obtida_em": c.obtida_em}
        for c in ConquistaUsuario.objects.filter(usuario=request.user).select_related("conquista")
    ]
    return R(dados)


@api_view(["GET"])
def historico(request):
    """Dados extras para o front web: calendário, gráfico semanal, tendências e conquistas."""
    return R(s.historico(request.user))



# ---------------------------------------------------------------------------
# Batalha
# ---------------------------------------------------------------------------
from . import batalha as bt  # noqa: E402


@api_view(["GET"])
def batalha(request):
    return R(bt.resumo(request.user))


@api_view(["POST"])
def batalha_iniciar(request):
    try:
        return R(bt.estado(bt.iniciar(request.user, request.data.get("inimigo"))))
    except s.RegraDoJogoError as exc:
        return _erro(exc)


@api_view(["POST"])
def batalha_desistir(request):
    b = bt.desistir(request.user)
    return R({"batalha": bt.estado(b) if b else None})


@api_view(["POST"])
def batalha_responder(request):
    questao = get_object_or_404(Questao, pk=request.data.get("questao_id"))
    alternativa = get_object_or_404(Alternativa, pk=request.data.get("alternativa_id"))
    try:
        tempo = max(0, int(request.data.get("tempo_segundos", 0)))
        return R(bt.responder(request.user, questao, alternativa, tempo))
    except (s.RegraDoJogoError, ValueError) as exc:
        return _erro(exc)
