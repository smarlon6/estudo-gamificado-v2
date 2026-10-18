"""
Importa questões de uma planilha Excel, de um PDF do Qconcursos ou de um JSON.

Exemplos:
    python manage.py importar_prova questoes.xlsx --publicar
    python manage.py importar_prova prova.pdf
    python manage.py importar_prova prova.pdf --json prova.json --apenas-json   (só gera o JSON)
    python manage.py importar_prova prova.json --publicar
"""
from django.core.management.base import BaseCommand, CommandError

from questoes import importacao


class Command(BaseCommand):
    help = "Importa questões de uma planilha .xlsx, de um PDF (impressão do Qconcursos) ou de um JSON."

    def add_arguments(self, parser):
        parser.add_argument("arquivo", help="Caminho do .xlsx, .pdf ou .json")
        parser.add_argument("--publicar", action="store_true",
                            help="Questões sem avisos já entram como ativas")
        parser.add_argument("--ocr", action="store_true", help="Força OCR mesmo com texto no PDF")
        parser.add_argument("--json", dest="saida_json", help="Salva o resultado lido neste JSON")
        parser.add_argument("--apenas-json", action="store_true",
                            help="Só gera o JSON (use com --json), sem gravar no banco")

    def handle(self, *args, **opts):
        def progresso(atual, total):
            self.stdout.write(f"\r  lendo página {atual}/{total}...", ending="")
            self.stdout.flush()

        try:
            dados = importacao.ler_prova(opts["arquivo"], forcar_ocr=opts["ocr"], progresso=progresso)
        except importacao.ImportacaoError as exc:
            raise CommandError(str(exc))
        except FileNotFoundError:
            raise CommandError(f"Arquivo não encontrado: {opts['arquivo']}")
        self.stdout.write("")

        questoes = dados.get("questoes", [])
        self.stdout.write(f"{len(questoes)} questões lidas"
                          + (" (com OCR)" if dados.get("usou_ocr") else ""))
        for aviso in dados.get("avisos", []):
            self.stdout.write(self.style.WARNING(f"  ! {aviso}"))
        for q in questoes:
            if q.get("avisos"):
                rotulo = q.get("codigo_externo") or "sem código"
                self.stdout.write(f"  Questão {q['numero']} ({rotulo}): " + " ".join(q["avisos"]))

        if opts["saida_json"]:
            importacao.salvar_json(dados, opts["saida_json"])
            self.stdout.write(self.style.SUCCESS(f"JSON salvo em {opts['saida_json']}"))
        if opts["apenas_json"]:
            return

        resumo = importacao.salvar_questoes(dados, publicar=opts["publicar"])
        self.stdout.write(self.style.SUCCESS(
            f"{resumo['criadas']} importadas: {resumo['ativas']} ativas, {resumo['rascunho']} em rascunho. "
            f"{resumo['duplicadas']} já existiam."
        ))
        if resumo["rascunho"]:
            self.stdout.write("Revise os rascunhos no admin e publique com a ação 'Publicar'.")
