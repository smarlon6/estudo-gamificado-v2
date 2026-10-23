from django.urls import path

from . import views

urlpatterns = [
    path("csrf/", views.csrf),
    path("auth/entrar/", views.entrar),
    path("auth/sair/", views.sair),
    path("auth/eu/", views.eu),

    path("painel/", views.painel),
    path("materias/", views.materias),
    path("bancas/", views.bancas),

    path("questoes/proxima/", views.proxima_questao),
    path("questoes/<int:questao_id>/responder/", views.responder),
    path("questoes/<int:questao_id>/anotacao/", views.anotar),

    path("meta/coletar/", views.coletar_meta),
    path("trilha/", views.trilha),
    path("trilha/<int:marco_id>/coletar/", views.coletar_marco),
    path("estatisticas/", views.estatisticas),
    path("historico/", views.historico),

    path("batalha/", views.batalha),
    path("batalha/iniciar/", views.batalha_iniciar),
    path("batalha/responder/", views.batalha_responder),
    path("batalha/desistir/", views.batalha_desistir),
]
