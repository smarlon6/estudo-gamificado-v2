from django.conf import settings
from django.db import models

from questoes.models import Alternativa, Materia, Questao

User = settings.AUTH_USER_MODEL


def meta_padrao():
    return settings.JOGO["META_DIARIA_PADRAO"]


class Perfil(models.Model):
    """Estado geral do jogador: moedas, XP, ofensiva e combo."""

    usuario = models.OneToOneField(User, on_delete=models.CASCADE, related_name="perfil")
    xp_total = models.PositiveIntegerField(default=0)
    ouro = models.PositiveIntegerField(default=0)
    diamantes = models.PositiveIntegerField(default=0)
    trofeus = models.PositiveIntegerField(default=0)

    meta_diaria = models.PositiveIntegerField(default=meta_padrao)
    ofensiva_atual = models.PositiveIntegerField(default=0)
    ofensiva_recorde = models.PositiveIntegerField(default=0)
    ultimo_dia_meta = models.DateField(null=True, blank=True)
    congeladores = models.PositiveIntegerField(
        default=0, help_text="Protegem a ofensiva em um dia sem estudo"
    )

    combo_atual = models.PositiveIntegerField(default=0)
    melhor_combo = models.PositiveIntegerField(default=0)

    def __str__(self):
        return f"Perfil de {self.usuario}"


class NivelMateria(models.Model):
    """XP acumulado em cada matéria (o 'atributo' de cada matéria)."""

    usuario = models.ForeignKey(User, on_delete=models.CASCADE, related_name="niveis_materia")
    materia = models.ForeignKey(Materia, on_delete=models.CASCADE)
    xp = models.PositiveIntegerField(default=0)

    class Meta:
        unique_together = [("usuario", "materia")]
        verbose_name = "nível por matéria"
        verbose_name_plural = "níveis por matéria"


class Resposta(models.Model):
    """Histórico de cada questão respondida. Base de todas as estatísticas."""

    class Modo(models.TextChoices):
        TREINO = "treino", "Treino livre"
        MISSAO = "missao", "Missão diária"
        REVISAO = "revisao", "Revisão de erros"
        SIMULADO = "simulado", "Simulado"
        BATALHA = "batalha", "Batalha"

    usuario = models.ForeignKey(User, on_delete=models.CASCADE, related_name="respostas")
    questao = models.ForeignKey(Questao, on_delete=models.CASCADE, related_name="respostas")
    alternativa = models.ForeignKey(Alternativa, on_delete=models.SET_NULL, null=True)
    correta = models.BooleanField()
    modo = models.CharField(max_length=10, choices=Modo.choices, default=Modo.TREINO)
    tempo_segundos = models.PositiveIntegerField(default=0)

    xp_ganho = models.PositiveIntegerField(default=0)
    trofeus_delta = models.IntegerField(default=0)
    primeira_tentativa = models.BooleanField(default=True)
    respondida_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-respondida_em"]
        indexes = [
            models.Index(fields=["usuario", "respondida_em"]),
            models.Index(fields=["usuario", "questao"]),
        ]


class Anotacao(models.Model):
    """Explicação escrita pelo próprio usuário (vale ouro na primeira vez)."""

    usuario = models.ForeignKey(User, on_delete=models.CASCADE, related_name="anotacoes")
    questao = models.ForeignKey(Questao, on_delete=models.CASCADE, related_name="anotacoes")
    texto = models.TextField()
    atualizada_em = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [("usuario", "questao")]
        verbose_name = "anotação"
        verbose_name_plural = "anotações"


class ProgressoDiario(models.Model):
    """Um registro por dia: alimenta a meta diária, a ofensiva e o 'fantasma'."""

    usuario = models.ForeignKey(User, on_delete=models.CASCADE, related_name="progressos")
    data = models.DateField()
    respondidas = models.PositiveIntegerField(default=0)
    acertos = models.PositiveIntegerField(default=0)
    xp_ganho = models.PositiveIntegerField(default=0)
    tempo_total_segundos = models.PositiveIntegerField(default=0)
    meta_concluida = models.BooleanField(default=False)
    recompensa_coletada = models.BooleanField(default=False)

    class Meta:
        unique_together = [("usuario", "data")]
        ordering = ["-data"]
        verbose_name = "progresso diário"
        verbose_name_plural = "progressos diários"


class Revisao(models.Model):
    """Revisão espaçada: questões erradas voltam em intervalos crescentes."""

    usuario = models.ForeignKey(User, on_delete=models.CASCADE, related_name="revisoes")
    questao = models.ForeignKey(Questao, on_delete=models.CASCADE)
    proxima_em = models.DateField()
    liberada_em = models.DateTimeField(
        null=True, blank=True, help_text="Reforço do mesmo dia: só aparece depois deste horário"
    )
    etapa = models.PositiveSmallIntegerField(default=0, help_text="Quantas revisões seguidas acertou")
    intervalo_dias = models.PositiveIntegerField(default=0, help_text="0 = reforço do mesmo dia")
    facilidade = models.FloatField(default=2.5, help_text="Multiplicador do intervalo (cai quando você erra)")
    lapsos = models.PositiveIntegerField(default=0, help_text="Quantas vezes errou depois da 1ª vez")
    concluida = models.BooleanField(default=False)

    class Meta:
        unique_together = [("usuario", "questao")]
        ordering = ["proxima_em"]
        verbose_name = "revisão"
        verbose_name_plural = "revisões"


class Transacao(models.Model):
    """Extrato de moedas: todo ganho ou gasto fica registrado (auditoria e histórico)."""

    class Moeda(models.TextChoices):
        OURO = "ouro", "Ouro"
        DIAMANTES = "diamantes", "Diamantes"
        TROFEUS = "trofeus", "Troféus"

    usuario = models.ForeignKey(User, on_delete=models.CASCADE, related_name="transacoes")
    moeda = models.CharField(max_length=10, choices=Moeda.choices)
    quantidade = models.IntegerField()
    motivo = models.CharField(max_length=120)
    criada_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-criada_em"]
        verbose_name = "transação"
        verbose_name_plural = "transações"


class Conquista(models.Model):
    class Criterio(models.TextChoices):
        TOTAL_RESPOSTAS = "total_respostas", "Total de questões respondidas"
        OFENSIVA = "ofensiva", "Dias seguidos de ofensiva"
        COMBO = "combo", "Acertos seguidos"
        NIVEL = "nivel", "Nível geral"

    codigo = models.SlugField(unique=True)
    nome = models.CharField(max_length=100)
    descricao = models.CharField("descrição", max_length=200)
    icone = models.CharField(max_length=30, default="medalha")
    criterio = models.CharField(max_length=20, choices=Criterio.choices)
    valor_alvo = models.PositiveIntegerField()
    recompensa_ouro = models.PositiveIntegerField(default=0)
    recompensa_diamantes = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["criterio", "valor_alvo"]

    def __str__(self):
        return self.nome


class ConquistaUsuario(models.Model):
    usuario = models.ForeignKey(User, on_delete=models.CASCADE, related_name="conquistas")
    conquista = models.ForeignKey(Conquista, on_delete=models.CASCADE)
    obtida_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("usuario", "conquista")]
        ordering = ["-obtida_em"]


class MarcoTrilha(models.Model):
    """Recompensas da trilha de troféus (estilo Brawl Stars)."""

    trofeus = models.PositiveIntegerField(unique=True)
    titulo = models.CharField(max_length=100)
    recompensa_ouro = models.PositiveIntegerField(default=0)
    recompensa_diamantes = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["trofeus"]
        verbose_name = "marco da trilha"
        verbose_name_plural = "marcos da trilha"

    def __str__(self):
        return f"{self.trofeus} troféus · {self.titulo}"


class MarcoColetado(models.Model):
    usuario = models.ForeignKey(User, on_delete=models.CASCADE, related_name="marcos_coletados")
    marco = models.ForeignKey(MarcoTrilha, on_delete=models.CASCADE)
    coletado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("usuario", "marco")]


class Inimigo(models.Model):
    """Adversário das batalhas. As imagens ficam no front em /batalha/<slug>/."""

    slug = models.SlugField(unique=True)
    nome = models.CharField(max_length=100)
    descricao = models.CharField("descrição", max_length=200, blank=True)
    vida = models.PositiveIntegerField(default=20, help_text="Quantos acertos são necessários para derrotá-lo")
    recompensa_ouro = models.PositiveIntegerField(default=40)
    recompensa_diamantes = models.PositiveIntegerField(default=1)
    ordem = models.PositiveIntegerField(default=0)
    ativo = models.BooleanField(default=True)

    class Meta:
        ordering = ["ordem", "nome"]

    def __str__(self):
        return self.nome


class Batalha(models.Model):
    """Uma batalha: cada acerto tira 1 de vida do inimigo, cada erro tira 1 da sua."""

    class Status(models.TextChoices):
        ANDAMENTO = "andamento", "Em andamento"
        VITORIA = "vitoria", "Vitória"
        DERROTA = "derrota", "Derrota"
        DESISTENCIA = "desistencia", "Desistência"

    usuario = models.ForeignKey(User, on_delete=models.CASCADE, related_name="batalhas")
    inimigo = models.ForeignKey(Inimigo, on_delete=models.PROTECT, related_name="batalhas")
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.ANDAMENTO)
    vida_inimigo_max = models.PositiveIntegerField()
    vida_inimigo = models.PositiveIntegerField()
    vida_jogador_max = models.PositiveIntegerField()
    vida_jogador = models.PositiveIntegerField()
    acertos = models.PositiveIntegerField(default=0)
    erros = models.PositiveIntegerField(default=0)
    sequencia = models.PositiveIntegerField(default=0, help_text="Acertos seguidos agora")
    melhor_sequencia = models.PositiveIntegerField(default=0)
    ouro_ganho = models.PositiveIntegerField(default=0)
    diamantes_ganhos = models.PositiveIntegerField(default=0)
    trofeus_ganhos = models.PositiveIntegerField(default=0)
    iniciada_em = models.DateTimeField(auto_now_add=True)
    finalizada_em = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-iniciada_em"]

    def __str__(self):
        return f"{self.usuario} x {self.inimigo} ({self.get_status_display()})"
