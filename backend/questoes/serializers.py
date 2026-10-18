from rest_framework import serializers

from .models import Alternativa, Assunto, Banca, Materia, Questao


class AlternativaPublicaSerializer(serializers.ModelSerializer):
    """Alternativa SEM o campo 'correta' (o gabarito só sai depois de responder)."""

    class Meta:
        model = Alternativa
        fields = ["id", "letra", "texto"]


class QuestaoPublicaSerializer(serializers.ModelSerializer):
    materia = serializers.CharField(source="materia.nome")
    assunto = serializers.CharField(source="assunto.nome", default=None)
    banca = serializers.CharField(source="banca.sigla", default=None)
    alternativas = AlternativaPublicaSerializer(many=True)

    class Meta:
        model = Questao
        fields = ["id", "tipo", "enunciado", "materia", "assunto", "banca",
                  "ano", "orgao", "cargo", "dificuldade", "alternativas"]


class AssuntoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Assunto
        fields = ["id", "nome"]


class MateriaSerializer(serializers.ModelSerializer):
    assuntos = AssuntoSerializer(many=True, read_only=True)
    total_questoes = serializers.IntegerField(read_only=True)

    class Meta:
        model = Materia
        fields = ["id", "nome", "slug", "cor", "assuntos", "total_questoes"]


class BancaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Banca
        fields = ["id", "sigla", "nome"]
