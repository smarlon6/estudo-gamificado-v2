import json
import tempfile
from pathlib import Path

from django import forms
from django.contrib import admin, messages
from django.core.exceptions import ValidationError
from django.http import HttpResponse, HttpResponseRedirect
from django.template.response import TemplateResponse
from django.urls import path, reverse

from . import importacao, planilha
from .models import Alternativa, Assunto, Banca, Materia, Questao


class AlternativaInlineFormSet(forms.BaseInlineFormSet):
    """Garante que a questão tenha pelo menos 2 alternativas e exatamente 1 correta."""

    def clean(self):
        super().clean()
        ativas = [
            f for f in self.forms
            if f.cleaned_data and not f.cleaned_data.get("DELETE", False)
        ]
        if len(ativas) < 2:
            raise ValidationError("Cadastre pelo menos 2 alternativas.")
        corretas = sum(1 for f in ativas if f.cleaned_data.get("correta"))
        if corretas != 1:
            raise ValidationError("Marque exatamente 1 alternativa como correta.")


class AlternativaInline(admin.TabularInline):
    model = Alternativa
    formset = AlternativaInlineFormSet
    extra = 5
    max_num = 5

    def get_extra(self, request, obj=None, **kwargs):
        return 0 if obj else 5


class AssuntoInline(admin.TabularInline):
    model = Assunto
    extra = 1


@admin.register(Materia)
class MateriaAdmin(admin.ModelAdmin):
    list_display = ["nome", "slug", "cor", "ordem"]
    list_editable = ["ordem"]
    prepopulated_fields = {"slug": ["nome"]}
    inlines = [AssuntoInline]


@admin.register(Assunto)
class AssuntoAdmin(admin.ModelAdmin):
    list_display = ["nome", "materia"]
    list_filter = ["materia"]
    search_fields = ["nome"]


@admin.register(Banca)
class BancaAdmin(admin.ModelAdmin):
    list_display = ["sigla", "nome"]
    search_fields = ["sigla", "nome"]


class ComAvisoFilter(admin.SimpleListFilter):
    title = "avisos da importação"
    parameter_name = "aviso"

    def lookups(self, request, model_admin):
        return [("sim", "Com avisos"), ("nao", "Sem avisos")]

    def queryset(self, request, queryset):
        if self.value() == "sim":
            return queryset.exclude(nota_importacao="")
        if self.value() == "nao":
            return queryset.filter(nota_importacao="")
        return queryset


class ImportarProvaForm(forms.Form):
    arquivo = forms.FileField(
        label="Arquivo da prova",
        help_text="Planilha Excel (.xlsx) no formato do modelo, PDF no formato de impressão do "
                  "Qconcursos (com o gabarito no final) ou um JSON gerado por esta mesma tela.",
    )
    publicar = forms.BooleanField(
        label="Publicar automaticamente as questões sem avisos",
        required=False,
        help_text="Desmarcado: tudo entra como rascunho para você revisar antes.",
    )
    forcar_ocr = forms.BooleanField(
        label="Forçar OCR (mesmo que o PDF tenha texto)", required=False,
    )
    apenas_json = forms.BooleanField(
        label="Só gerar o JSON para conferir (não grava nada)", required=False,
    )

    def clean_arquivo(self):
        arq = self.cleaned_data["arquivo"]
        if Path(arq.name).suffix.lower() not in (".xlsx", ".xlsm", ".pdf", ".json"):
            raise ValidationError("Envie um arquivo .xlsx, .pdf ou .json.")
        return arq


@admin.register(Questao)
class QuestaoAdmin(admin.ModelAdmin):
    list_display = ["id", "codigo_externo", "materia", "assunto", "banca", "ano",
                    "tipo", "status", "tem_aviso"]
    list_filter = ["status", ComAvisoFilter, "tipo", "materia", "banca", "ano", "dificuldade"]
    search_fields = ["enunciado", "codigo_externo", "orgao", "cargo", "prova"]
    autocomplete_fields = ["assunto", "banca"]
    inlines = [AlternativaInline]
    actions = ["publicar", "mover_para_rascunho", "limpar_avisos"]
    readonly_fields = ["nota_importacao"]
    fieldsets = [
        (None, {"fields": ["nota_importacao", "materia", "assunto", "tipo", "enunciado"]}),
        ("Origem", {"fields": ["banca", "ano", "orgao", "cargo", "prova", "codigo_externo"]}),
        ("Gabarito e classificação", {"fields": ["explicacao", "dificuldade", "status"]}),
    ]

    @admin.display(boolean=True, description="Aviso")
    def tem_aviso(self, obj):
        return bool(obj.nota_importacao)

    def get_fieldsets(self, request, obj=None):
        fieldsets = super().get_fieldsets(request, obj)
        if obj is None or not obj.nota_importacao:
            primeiro = dict(fieldsets[0][1])
            primeiro["fields"] = [f for f in primeiro["fields"] if f != "nota_importacao"]
            fieldsets = [(fieldsets[0][0], primeiro)] + list(fieldsets[1:])
        return fieldsets

    def get_formset_kwargs(self, request, obj, inline, prefix):
        kwargs = super().get_formset_kwargs(request, obj, inline, prefix)
        # Questão nova do tipo Certo/Errado: já sugere as duas alternativas.
        if obj is None and request.method == "GET" and request.GET.get("tipo") == "CE":
            kwargs["initial"] = [{"letra": "Certo"}, {"letra": "Errado"}]
        return kwargs

    # --- Ações em massa -----------------------------------------------------
    @admin.action(description="Publicar (ativar) as questões selecionadas")
    def publicar(self, request, queryset):
        sem_gabarito = [q.id for q in queryset if not q.alternativas.filter(correta=True).exists()]
        ok = queryset.exclude(id__in=sem_gabarito).update(status=Questao.Status.ATIVA)
        self.message_user(request, f"{ok} questão(ões) publicada(s).", messages.SUCCESS)
        if sem_gabarito:
            self.message_user(
                request, f"Sem alternativa correta, ficaram em rascunho: {sem_gabarito}", messages.WARNING
            )

    @admin.action(description="Mover para rascunho")
    def mover_para_rascunho(self, request, queryset):
        n = queryset.update(status=Questao.Status.RASCUNHO)
        self.message_user(request, f"{n} questão(ões) movida(s) para rascunho.")

    @admin.action(description="Marcar avisos da importação como resolvidos")
    def limpar_avisos(self, request, queryset):
        n = queryset.update(nota_importacao="")
        self.message_user(request, f"Avisos limpos em {n} questão(ões).")

    # --- Tela de importação -------------------------------------------------
    def get_urls(self):
        return [
            path("importar/", self.admin_site.admin_view(self.importar_view),
                 name="questoes_questao_importar"),
            path("importar/modelo.xlsx", self.admin_site.admin_view(self.modelo_view),
                 name="questoes_questao_modelo"),
        ] + super().get_urls()

    def modelo_view(self, request):
        import io

        buffer = io.BytesIO()
        planilha.gerar_modelo(buffer)
        resp = HttpResponse(
            buffer.getvalue(),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        resp["Content-Disposition"] = 'attachment; filename="modelo_questoes.xlsx"'
        return resp

    def importar_view(self, request):
        form = ImportarProvaForm(request.POST or None, request.FILES or None)
        resultado = None
        if request.method == "POST" and form.is_valid():
            arq = form.cleaned_data["arquivo"]
            sufixo = Path(arq.name).suffix.lower()
            with tempfile.NamedTemporaryFile(suffix=sufixo, delete=False) as tmp:
                for parte in arq.chunks():
                    tmp.write(parte)
                caminho = tmp.name
            try:
                dados = importacao.ler_prova(caminho, forcar_ocr=form.cleaned_data["forcar_ocr"])
            except importacao.ImportacaoError as exc:
                messages.error(request, str(exc))
                dados = None
            except json.JSONDecodeError:
                messages.error(request, "O arquivo JSON está inválido.")
                dados = None
            finally:
                Path(caminho).unlink(missing_ok=True)

            if dados is not None and form.cleaned_data["apenas_json"]:
                nome = Path(arq.name).stem + ".json"
                resp = HttpResponse(
                    json.dumps(dados, ensure_ascii=False, indent=2),
                    content_type="application/json; charset=utf-8",
                )
                resp["Content-Disposition"] = f'attachment; filename="{nome}"'
                return resp

            if dados is not None:
                resumo = importacao.salvar_questoes(dados, publicar=form.cleaned_data["publicar"])
                for aviso in dados.get("avisos", []):
                    messages.warning(request, aviso)
                com_aviso = sum(1 for q in dados.get("questoes", []) if q.get("avisos"))
                messages.success(
                    request,
                    f"{resumo['criadas']} questões importadas ({resumo['ativas']} publicadas, "
                    f"{resumo['rascunho']} em rascunho). {resumo['duplicadas']} já existiam. "
                    f"{com_aviso} com avisos para conferir."
                    + (" (texto lido por OCR)" if dados.get("usou_ocr") else ""),
                )
                if resumo["criadas"]:
                    url = reverse("admin:questoes_questao_changelist")
                    return HttpResponseRedirect(f"{url}?status__exact=rascunho")
                resultado = resumo

        contexto = {
            **self.admin_site.each_context(request),
            "opts": self.model._meta,
            "title": "Importar questões",
            "form": form,
            "resultado": resultado,
            "ocr_disponivel": importacao.ocr_disponivel(),
        }
        return TemplateResponse(request, "admin/questoes/questao/importar.html", contexto)
