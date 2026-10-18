from django.db import models
from django.utils.text import slugify


class Materia(models.Model):
    nome = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=110, unique=True, blank=True)
    cor = models.CharField(max_length=7, default="#7B93FF", help_text="Cor hex usada no front")
    ordem = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["ordem", "nome"]
        verbose_name = "matéria"

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.nome)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.nome


class Assunto(models.Model):
    materia = models.ForeignKey(Materia, on_delete=models.CASCADE, related_name="assuntos")
    nome = models.CharField(max_length=150)

    class Meta:
        ordering = ["materia__nome", "nome"]
        unique_together = [("materia", "nome")]

    def __str__(self):
        return f"{self.materia} · {self.nome}"


class Banca(models.Model):
    sigla = models.CharField(max_length=30, unique=True)
    nome = models.CharField(max_length=150, blank=True)

    class Meta:
        ordering = ["sigla"]

    def __str__(self):
        return self.sigla


class Questao(models.Model):
    class Tipo(models.TextChoices):
        MULTIPLA_ESCOLHA = "ME", "Múltipla escolha"
        CERTO_ERRADO = "CE", "Certo/Errado"

    class Status(models.TextChoices):
        ATIVA = "ativa", "Ativa"
        ANULADA = "anulada", "Anulada"
        ALTERADA = "alterada", "Gabarito alterado"
        RASCUNHO = "rascunho", "Rascunho (revisão de importação)"

    class Dificuldade(models.IntegerChoices):
        FACIL = 1, "Fácil"
        MEDIA = 2, "Média"
        DIFICIL = 3, "Difícil"

    materia = models.ForeignKey(Materia, on_delete=models.PROTECT, related_name="questoes")
    assunto = models.ForeignKey(
        Assunto, on_delete=models.SET_NULL, null=True, blank=True, related_name="questoes"
    )
    banca = models.ForeignKey(Banca, on_delete=models.SET_NULL, null=True, blank=True)
    ano = models.PositiveIntegerField(null=True, blank=True)
    orgao = models.CharField("órgão", max_length=150, blank=True)
    cargo = models.CharField(max_length=150, blank=True)
    prova = models.CharField(max_length=255, blank=True)
    codigo_externo = models.CharField(
        "código externo", max_length=30, blank=True, db_index=True,
        help_text="Código da questão na origem (ex.: Q2178820). Evita importar duplicada.",
    )
    nota_importacao = models.TextField(
        "avisos da importação", blank=True,
        help_text="Pontos para conferir, gerados automaticamente na importação do PDF.",
    )

    tipo = models.CharField(max_length=2, choices=Tipo.choices, default=Tipo.MULTIPLA_ESCOLHA)
    enunciado = models.TextField()
    explicacao = models.TextField("explicação", blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ATIVA)
    dificuldade = models.PositiveSmallIntegerField(
        choices=Dificuldade.choices, default=Dificuldade.MEDIA
    )

    criada_em = models.DateTimeField(auto_now_add=True)
    atualizada_em = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-criada_em"]
        verbose_name = "questão"
        verbose_name_plural = "questões"
        indexes = [models.Index(fields=["materia", "status"])]

    def __str__(self):
        origem = " ".join(str(x) for x in [self.banca or "", self.ano or ""] if x)
        return f"#{self.pk} {self.materia} {origem}".strip()

    @property
    def alternativa_correta(self):
        return self.alternativas.filter(correta=True).first()


class Alternativa(models.Model):
    questao = models.ForeignKey(Questao, on_delete=models.CASCADE, related_name="alternativas")
    letra = models.CharField(max_length=10, help_text="A, B, C... ou Certo/Errado")
    texto = models.TextField()
    correta = models.BooleanField(default=False)

    class Meta:
        ordering = ["questao", "letra"]
        unique_together = [("questao", "letra")]

    def __str__(self):
        return f"{self.letra}) {self.texto[:50]}"
