"""Gera a planilha modelo para cadastrar questões.

Uso:
    python manage.py gerar_modelo_excel                  (cria modelo_questoes.xlsx na pasta atual)
    python manage.py gerar_modelo_excel C:\\pasta\\minhas_questoes.xlsx --sem-exemplos
"""
from django.core.management.base import BaseCommand

from questoes.planilha import gerar_modelo


class Command(BaseCommand):
    help = "Gera a planilha modelo (.xlsx) para cadastrar questões e importar depois."

    def add_arguments(self, parser):
        parser.add_argument("destino", nargs="?", default="modelo_questoes.xlsx")
        parser.add_argument("--sem-exemplos", action="store_true", help="Gera a planilha sem as linhas de exemplo")

    def handle(self, *args, **opts):
        gerar_modelo(opts["destino"], com_exemplos=not opts["sem_exemplos"])
        self.stdout.write(self.style.SUCCESS(f"Planilha modelo criada: {opts['destino']}"))
