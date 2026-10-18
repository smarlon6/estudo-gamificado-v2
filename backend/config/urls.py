from django.contrib import admin
from django.urls import include, path

admin.site.site_header = "Estudo Gamificado"
admin.site.site_title = "Estudo Gamificado"
admin.site.index_title = "Cadastro de questões e configurações do jogo"

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("jogo.urls")),
]
