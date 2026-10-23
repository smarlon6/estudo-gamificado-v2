from django.contrib import admin

from .models import (
    Anotacao,
    Conquista,
    ConquistaUsuario,
    MarcoTrilha,
    NivelMateria,
    Perfil,
    ProgressoDiario,
    Resposta,
    Revisao,
    Transacao,
)


@admin.register(Perfil)
class PerfilAdmin(admin.ModelAdmin):
    list_display = ["usuario", "xp_total", "ouro", "diamantes", "trofeus",
                    "ofensiva_atual", "ofensiva_recorde", "meta_diaria"]


@admin.register(Resposta)
class RespostaAdmin(admin.ModelAdmin):
    list_display = ["respondida_em", "usuario", "questao", "correta", "modo",
                    "xp_ganho", "trofeus_delta", "tempo_segundos"]
    list_filter = ["correta", "modo", "questao__materia"]
    date_hierarchy = "respondida_em"


@admin.register(ProgressoDiario)
class ProgressoDiarioAdmin(admin.ModelAdmin):
    list_display = ["data", "usuario", "respondidas", "acertos", "xp_ganho",
                    "meta_concluida", "recompensa_coletada"]
    date_hierarchy = "data"


@admin.register(Revisao)
class RevisaoAdmin(admin.ModelAdmin):
    list_display = ["questao", "usuario", "proxima_em", "etapa", "concluida"]
    list_filter = ["concluida"]


@admin.register(Transacao)
class TransacaoAdmin(admin.ModelAdmin):
    list_display = ["criada_em", "usuario", "moeda", "quantidade", "motivo"]
    list_filter = ["moeda"]


@admin.register(Conquista)
class ConquistaAdmin(admin.ModelAdmin):
    list_display = ["nome", "criterio", "valor_alvo", "recompensa_ouro", "recompensa_diamantes"]
    prepopulated_fields = {"codigo": ["nome"]}


@admin.register(MarcoTrilha)
class MarcoTrilhaAdmin(admin.ModelAdmin):
    list_display = ["trofeus", "titulo", "recompensa_ouro", "recompensa_diamantes"]


admin.site.register(NivelMateria)
admin.site.register(ConquistaUsuario)
admin.site.register(Anotacao)


from .models import Batalha, Inimigo  # noqa: E402


@admin.register(Inimigo)
class InimigoAdmin(admin.ModelAdmin):
    list_display = ("nome", "slug", "vida", "recompensa_ouro", "recompensa_diamantes", "ordem", "ativo")
    list_editable = ("vida", "ordem", "ativo")


@admin.register(Batalha)
class BatalhaAdmin(admin.ModelAdmin):
    list_display = ("usuario", "inimigo", "status", "acertos", "erros", "vida_inimigo", "vida_jogador", "iniciada_em")
    list_filter = ("status", "inimigo")
