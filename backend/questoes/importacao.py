"""
Importação de provas em PDF (formato de impressão do Qconcursos).

Fluxo:
    PDF ──► linhas de texto com posição (camada de texto do PDF ou OCR)
        ──► círculos das alternativas detectados na imagem da página
        ──► questões + gabarito (dicionários)
        ──► banco de dados (como rascunho, para revisar no admin)

Também lê/grava o mesmo formato em JSON, útil para conferir antes de importar.

Dependências: pdfplumber, pypdfium2, numpy, Pillow.
OCR (só para PDFs sem texto): pytesseract + Tesseract instalado com o idioma "por".
"""
from __future__ import annotations

import json
import math
import os
import re
import shutil
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

# ---------------------------------------------------------------------------
# Estruturas
# ---------------------------------------------------------------------------
@dataclass
class Palavra:
    texto: str
    x0: float
    x1: float
    top: float
    bottom: float


@dataclass
class Linha:
    pagina: int
    palavras: list[Palavra]

    @property
    def texto(self) -> str:
        return " ".join(p.texto for p in self.palavras).strip()

    @property
    def x0(self) -> float:
        return min(p.x0 for p in self.palavras)

    @property
    def top(self) -> float:
        return min(p.top for p in self.palavras)

    @property
    def bottom(self) -> float:
        return max(p.bottom for p in self.palavras)

    @property
    def chave(self) -> tuple[int, float]:
        return (self.pagina, self.top)


@dataclass
class Circulo:
    """Círculo da letra de uma alternativa (A), (B)..."""
    pagina: int
    top: float
    bottom: float
    x1: float

    @property
    def chave(self) -> tuple[int, float]:
        return (self.pagina, self.top)


@dataclass
class ResultadoLeitura:
    linhas: list[Linha]
    circulos: list[Circulo]
    usou_ocr: bool
    paginas: int
    avisos: list[str] = field(default_factory=list)


class ImportacaoError(Exception):
    pass


# ---------------------------------------------------------------------------
# Leitura do PDF
# ---------------------------------------------------------------------------
MARGEM_CABECALHO_PT = 32  # cabeçalho/rodapé do navegador (data, título, URL, nº da página)


def _configurar_tesseract():
    import pytesseract

    cmd = os.environ.get("TESSERACT_CMD")
    if not cmd and not shutil.which("tesseract"):
        padrao_windows = Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe")
        if padrao_windows.exists():
            cmd = str(padrao_windows)
    if cmd:
        pytesseract.pytesseract.tesseract_cmd = cmd
    return pytesseract


def ocr_disponivel() -> bool:
    try:
        pytesseract = _configurar_tesseract()
        return "por" in pytesseract.get_languages(config="")
    except Exception:
        return False


def _agrupar_em_linhas(palavras: list[Palavra], pagina: int, tolerancia: float = 3.0) -> list[Linha]:
    palavras = sorted(palavras, key=lambda p: (p.top, p.x0))
    linhas: list[list[Palavra]] = []
    for p in palavras:
        centro = (p.top + p.bottom) / 2
        for linha in linhas:
            ref = (linha[0].top + linha[0].bottom) / 2
            if abs(centro - ref) <= tolerancia:
                linha.append(p)
                break
        else:
            linhas.append([p])
    resultado = [Linha(pagina, sorted(l, key=lambda p: p.x0)) for l in linhas]
    return sorted(resultado, key=lambda l: l.top)


def _palavras_texto(pagina_plumber) -> list[Palavra]:
    return [
        Palavra(w["text"], w["x0"], w["x1"], w["top"], w["bottom"])
        for w in pagina_plumber.extract_words(keep_blank_chars=False)
    ]


def _palavras_ocr(imagem, escala: float) -> list[Palavra]:
    pytesseract = _configurar_tesseract()
    dados = pytesseract.image_to_data(
        imagem, lang="por", config="--psm 4", output_type=pytesseract.Output.DICT
    )
    palavras = []
    for i, texto in enumerate(dados["text"]):
        texto = (texto or "").strip()
        if not texto or float(dados["conf"][i]) < 0:
            continue
        x, y, w, h = (dados[k][i] for k in ("left", "top", "width", "height"))
        palavras.append(Palavra(texto, x / escala, (x + w) / escala, y / escala, (y + h) / escala))
    return palavras


def detectar_circulos(imagem, escala: float, pagina: int) -> list[Circulo]:
    """
    Procura os círculos das letras das alternativas na faixa esquerda da página.

    Estratégia: na faixa de x onde ficam os círculos, separa "blocos" de linhas com tinta;
    um bloco é círculo se tem o tamanho certo e há tinta ao longo de quase toda a
    circunferência (letras e palavras comuns não formam um anel).
    """
    cinza = np.asarray(imagem.convert("L"))
    tinta = cinza < 150
    x_ini, x_fim = int(30 * escala), int(47 * escala)
    faixa = tinta[:, x_ini:x_fim]
    linhas_com_tinta = faixa.any(axis=1)

    circulos = []
    y = 0
    altura_total = len(linhas_com_tinta)
    while y < altura_total:
        if not linhas_com_tinta[y]:
            y += 1
            continue
        y0 = y
        while y < altura_total and linhas_com_tinta[y]:
            y += 1
        y1 = y
        h_pt = (y1 - y0) / escala
        if not (9 <= h_pt <= 16):
            continue
        bloco = faixa[y0:y1]
        cols = np.where(bloco.any(axis=0))[0]
        xa, xb = cols.min(), cols.max()
        w_pt = (xb - xa) / escala
        if not (9 <= w_pt <= 16) or abs(w_pt - h_pt) > 3:
            continue
        cy, cx = (y1 - y0) / 2, (xa + xb) / 2
        raio = min(xb - xa, y1 - y0) / 2 - 1.5 * escala / 4
        acertos = 0
        for k in range(72):
            ang = 2 * math.pi * k / 72
            achou = False
            for dr in np.linspace(-0.8, 0.8, 5) * escala:
                py = int(round(cy + (raio + dr) * math.sin(ang)))
                px = int(round(cx + (raio + dr) * math.cos(ang)))
                if 0 <= py < bloco.shape[0] and 0 <= px < bloco.shape[1] and bloco[py, px]:
                    achou = True
                    break
            acertos += achou
        if acertos / 72 >= 0.8:
            circulos.append(Circulo(pagina, y0 / escala, y1 / escala, (x_ini + xb) / escala))
    return circulos


RE_LISTA_ROMANOS = re.compile(
    r"^(?:I{1,3}|IV|VI{0,3}|IX|X)(?:, (?:I{1,3}|IV|VI{0,3}|IX|X))*"
    r"(?: e (?:I{1,3}|IV|VI{0,3}|IX|X))?\.?$"
)


def ler_romanos_por_formato(recorte) -> str | None:
    """
    Lê alternativas curtas como "I, II e IV." pelo formato dos caracteres.
    O OCR erra muito nelas (na fonte sem serifa, o "I" é só um traço), mas como só
    existem I, V, X, "e", vírgula e ponto, a forma de cada caractere basta:
    traço alto e fino = I; alto e largo = V ou X; baixo = "e"; minúsculo = , ou .
    Só é aceito se o resultado formar uma lista válida de romanos.
    """
    tinta = np.asarray(recorte.convert("L")) < 150
    linhas = np.where(tinta.any(axis=1))[0]
    if len(linhas) == 0:
        return None
    tinta = tinta[linhas.min():linhas.max() + 1]
    colunas = tinta.any(axis=0)
    glifos = []
    x = 0
    while x < len(colunas):
        if not colunas[x]:
            x += 1
            continue
        x0 = x
        while x < len(colunas) and colunas[x]:
            x += 1
        g = tinta[:, x0:x]
        r = np.where(g.any(axis=1))[0]
        glifos.append({"x0": x0, "x1": x, "top": r.min(), "bottom": r.max(),
                       "w": x - x0, "img": g[r.min():r.max() + 1]})
    if not glifos or len(glifos) > 30:
        return None
    H = max(g["bottom"] - g["top"] + 1 for g in glifos)
    base = float(np.median([g["bottom"] for g in glifos if g["bottom"] - g["top"] + 1 > 0.8 * H]))
    saida, anterior = [], None
    for g in glifos:
        h = g["bottom"] - g["top"] + 1
        if anterior is not None and g["x0"] - anterior["x1"] > 0.3 * H:
            saida.append(" ")
        if h < 0.4 * H:
            saida.append("," if g["bottom"] > base + 0.08 * H else ".")
        elif h < 0.85 * H:
            saida.append("e")
        elif g["w"] < 0.3 * H:
            saida.append("I")
        else:
            tinta_base = g["img"][-max(1, h // 6):].any(axis=0).sum()
            saida.append("V" if tinta_base < 0.5 * g["w"] else "X")
        anterior = g
    texto = re.sub(r"\s*,\s*", ", ", "".join(saida)).strip()
    texto = re.sub(r"\s+e\s+", " e ", texto)
    texto = re.sub(r"\s+\.", ".", texto)
    return texto if RE_LISTA_ROMANOS.match(texto) else None


def _reler_alternativas_romanas(imagem, escala, palavras, circulos) -> list[Palavra]:
    """Troca o texto do OCR pelas leituras por formato quando a alternativa é uma lista de romanos."""
    for c in circulos:
        na_linha = [p for p in palavras
                    if p.x0 > c.x1 - 2 and p.top < c.bottom + 2 and p.bottom > c.top - 2]
        if len(" ".join(p.texto for p in na_linha)) > 25:
            continue
        x_fim = max([p.x1 for p in na_linha] + [c.x1 + 60]) + 4
        recorte = imagem.crop((int((c.x1 + 2) * escala), int((c.top - 1.5) * escala),
                               int(x_fim * escala), int((c.bottom + 1.5) * escala)))
        lido = ler_romanos_por_formato(recorte)
        if lido:
            palavras = [p for p in palavras if p not in na_linha]
            palavras.append(Palavra(lido, c.x1 + 3, x_fim, c.top + 1, c.bottom - 1))
    return palavras


def ler_pdf(caminho, forcar_ocr: bool = False, dpi_ocr: int = 300, progresso=None) -> ResultadoLeitura:
    import pdfplumber
    import pypdfium2 as pdfium

    caminho = str(caminho)
    linhas: list[Linha] = []
    circulos: list[Circulo] = []
    usou_ocr = False
    avisos: list[str] = []

    doc = pdfium.PdfDocument(caminho)
    with pdfplumber.open(caminho) as pdf:
        total = len(pdf.pages)
        for i, pag in enumerate(pdf.pages):
            if progresso:
                progresso(i + 1, total)
            altura = float(pag.height)
            palavras = [] if forcar_ocr else _palavras_texto(pag)
            precisa_ocr = len(palavras) < 5
            escala = (dpi_ocr if precisa_ocr else 150) / 72
            imagem = doc[i].render(scale=escala).to_pil()
            if precisa_ocr:
                if not ocr_disponivel():
                    raise ImportacaoError(
                        "Este PDF não tem texto selecionável (foi gerado como imagem) e o OCR "
                        "não está disponível. Instale o Tesseract com o idioma Português, ou gere "
                        "o PDF pelo Chrome usando 'Salvar como PDF' (que mantém o texto)."
                    )
                palavras = _palavras_ocr(imagem, escala)
                usou_ocr = True
            palavras = [
                p for p in palavras
                if MARGEM_CABECALHO_PT < p.top and p.bottom < altura - MARGEM_CABECALHO_PT
            ]
            circulos_pagina = detectar_circulos(imagem, escala, i)
            if precisa_ocr:
                palavras = _reler_alternativas_romanas(imagem, escala, palavras, circulos_pagina)
            linhas.extend(_agrupar_em_linhas(palavras, i))
            circulos.extend(circulos_pagina)
    return ResultadoLeitura(linhas, circulos, usou_ocr, total, avisos)


# ---------------------------------------------------------------------------
# Interpretação (formato Qconcursos)
# ---------------------------------------------------------------------------
# "12 Q2178831 Matéria > Assunto". O OCR às vezes lê o Q como 0/O e o número como "1B" ou "n".
RE_CABECALHO = re.compile(r"^(\S{1,3})\s+[Q0OoD]\s?(\d{6,8})\.?(?:\s+(.*))?$")
RE_ANO = re.compile(r"Ano:\s*(\d{4})")
RE_BANCA = re.compile(r"Banca:\s*(.+?)\s+[ÓO]rg[ãa]o:\s*(.+)$")
RE_PROVA = re.compile(r"^Provas?:\s*(.+)$")
RE_RESPOSTAS = re.compile(r"^Respostas\b", re.IGNORECASE)
RE_ITEM_GABARITO = re.compile(r"^(\d{1,3})\W?([A-E])$")
PALAVRAS_FIGURA = re.compile(r"\b(figura|imagem|gr[áa]fico|tabela|quadro|ilustra[çc][ãa]o)\b", re.I)


def _parse_classificacao(texto: str) -> tuple[str | None, str | None]:
    texto = texto.strip()
    if not texto or texto.lower().startswith("não definido") or texto.lower().startswith("nao definido"):
        return None, None
    if ">" in texto:
        materia, resto = texto.split(">", 1)
        assunto = resto.split(",")[0].strip() or None
        return materia.strip() or None, assunto
    return texto, None


RE_ROMANO_OCR = re.compile(r"(?<![\w|])([|lI1]{1,3})(?=[\s.,;:)]|$)")


def _corrigir_ocr(texto: str) -> str:
    """Corrige numerais romanos lidos como '|', 'Il', 'Ill', '|l'."""
    def troca(m):
        token = m.group(1)
        if "|" in token or token in ("Il", "Ill", "lI", "lII", "IIl"):
            return "I" * len(token)
        return token
    return RE_ROMANO_OCR.sub(troca, texto)


ROMANOS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"]
RE_ITEM_ROMANO = re.compile(r"^([IlL1|\[\]NMVvXx]{1,4})\s+(?=\S)")


def _corrigir_itens_romanos(textos: list[str]) -> tuple[list[str], set[int]]:
    """
    Itens "I ... II ... III ..." do enunciado: o OCR lê "|", "Il", "INI".
    A partir de uma linha que começa com "I", as próximas que começam com
    um token parecido com romano recebem o número esperado da sequência.
    Devolve os textos corrigidos e os índices das linhas que iniciam item.
    """
    corrigidos, inicios = [], set()
    proximo = None
    for i, t in enumerate(textos):
        m = RE_ITEM_ROMANO.match(t)
        token = m.group(1) if m else None
        if token and token in ("I", "l", "|", "1", "[", "]") and proximo in (None, 0):
            proximo = 0
        if token and proximo is not None and proximo < len(ROMANOS):
            parece = token.upper().replace("|", "I").replace("L", "I").replace("1", "I") \
                .replace("[", "I").replace("]", "I").replace("N", "I").replace("M", "I")
            if set(parece) <= set("IVX"):
                t = ROMANOS[proximo] + t[m.end(1):]
                inicios.add(i)
                proximo += 1
        corrigidos.append(t)
    return corrigidos, inicios


def _montar_paragrafos(linhas: list[Linha]) -> str:
    if not linhas:
        return ""
    textos, inicios_item = _corrigir_itens_romanos([l.texto for l in linhas])
    margem = min(l.x0 for l in linhas)
    alturas = sorted(l.bottom - l.top for l in linhas)
    altura_tipica = alturas[len(alturas) // 2] or 10
    paragrafos: list[list[str]] = [[]]
    anterior = None
    for i, l in enumerate(linhas):
        if anterior is not None:
            mudou_pagina = l.pagina != anterior.pagina
            espaco = l.top - anterior.bottom
            recuo = l.x0 - margem > 6
            if i in inicios_item or (not mudou_pagina and (espaco > altura_tipica * 0.9 or recuo)):
                paragrafos.append([])
        paragrafos[-1].append(textos[i])
        anterior = l
    return _corrigir_ocr("\n".join(" ".join(p) for p in paragrafos if p).strip())


def _texto_alternativa(linhas: list[Linha], circulo: Circulo) -> str:
    partes = []
    for l in linhas:
        palavras = [
            p for p in l.palavras
            if not (p.x1 <= circulo.x1 + 2 or (p.x0 < circulo.x1 - 2 and len(p.texto) <= 3))
        ]
        if palavras:
            partes.append(" ".join(p.texto for p in palavras))
    return _corrigir_ocr(" ".join(partes).strip())


def _interpretar_gabarito(texto: str) -> dict[int, str]:
    """
    Lê "1: D 2: E 3: A ...". Como o gabarito vem em ordem, quando o OCR borra
    um número ("1D", "190:C") a sequência é usada para corrigir.
    """
    texto = re.sub(r"(\d)\s*[:;.,]\s*([A-E])\b", r"\1:\2", texto)
    gabarito: dict[int, str] = {}
    esperado = 1
    for token in texto.split():
        m = RE_ITEM_GABARITO.match(token)
        if not m:
            continue
        numero = int(m.group(1))
        if numero != esperado:
            numero = esperado
        gabarito[numero] = m.group(2)
        esperado = numero + 1
    return gabarito


def interpretar(leitura: ResultadoLeitura) -> dict:
    blocos: list[dict] = []
    gabarito_txt: list[str] = []
    atual = None
    estado = None
    fim_questoes = None

    for linha in leitura.linhas:
        txt = linha.texto
        if estado == "gabarito":
            gabarito_txt.append(txt)
            continue
        if RE_RESPOSTAS.match(txt):
            estado = "gabarito"
            fim_questoes = linha.chave
            gabarito_txt.append(txt[len("Respostas"):])
            continue
        m = RE_CABECALHO.match(txt)
        if m and linha.x0 < 60:
            esperado = (blocos[-1]["numero"] + 1) if blocos else 1
            numero = int(m.group(1)) if m.group(1).isdigit() else esperado
            if abs(numero - esperado) > 2:  # número ilegível: segue a sequência
                numero = esperado
            atual = {"numero": numero, "codigo_externo": "Q" + m.group(2),
                     "classificacao": m.group(3) or "", "inicio": linha.chave,
                     "ano": None, "banca": "", "orgao": "", "prova": "", "corpo": []}
            blocos.append(atual)
            estado = "cabecalho"
            continue
        if atual is None:
            continue
        if estado == "cabecalho":
            if RE_ANO.search(txt):
                atual["ano"] = int(RE_ANO.search(txt).group(1))
                mb = RE_BANCA.search(txt)
                if mb:
                    atual["banca"], atual["orgao"] = mb.group(1).strip(), mb.group(2).strip()
                estado = "prova"
            else:
                atual["classificacao"] += " " + txt
            continue
        if estado == "prova":
            mp = RE_PROVA.match(txt)
            if mp:
                atual["prova"] = mp.group(1).strip()
                estado = "corpo"
                continue
            estado = "corpo"
        atual["corpo"].append(linha)

    gabarito = _interpretar_gabarito(" ".join(gabarito_txt))

    questoes = []
    for i, b in enumerate(blocos):
        fim = blocos[i + 1]["inicio"] if i + 1 < len(blocos) else (fim_questoes or (10**6, 0))
        circs = sorted((c for c in leitura.circulos if b["inicio"] < c.chave < fim), key=lambda c: c.chave)
        avisos = []

        enunciado_linhas, alt_linhas = [], [[] for _ in circs]
        for l in b["corpo"]:
            # O círculo fica centralizado na alternativa (que pode ter várias linhas),
            # então a linha pertence ao último círculo cujo topo está até 6pt abaixo do centro dela.
            centro = (l.top + l.bottom) / 2
            idx = None
            for j, c in enumerate(circs):
                if (l.pagina, centro) >= (c.pagina, c.top - 6):
                    idx = j
            if idx is None:
                enunciado_linhas.append(l)
            else:
                alt_linhas[idx].append(l)

        textos = [_texto_alternativa(ls, c) for ls, c in zip(alt_linhas, circs)]
        if len(textos) == 2 and [t.lower() for t in textos] == ["certo", "errado"]:
            tipo, letras = "CE", ["Certo", "Errado"]
        else:
            tipo, letras = "ME", list("ABCDE")[: len(textos)]

        materia, assunto = _parse_classificacao(b["classificacao"])
        enunciado = _montar_paragrafos(enunciado_linhas)

        letra_gab = gabarito.get(b["numero"])
        if tipo == "CE" and letra_gab:
            letra_gab = {"C": "Certo", "E": "Errado"}.get(letra_gab)

        if len(textos) < 2:
            avisos.append("Alternativas não identificadas.")
        if any(not t for t in textos):
            avisos.append("Alguma alternativa ficou sem texto.")
        if not letra_gab:
            avisos.append("Gabarito não encontrado.")
        elif letra_gab not in letras:
            avisos.append(f"Gabarito '{letra_gab}' não corresponde às alternativas.")
        if not materia:
            avisos.append("Matéria não definida na prova: classifique manualmente.")
        if PALAVRAS_FIGURA.search(enunciado):
            avisos.append("Pode depender de figura/tabela: confira no PDF.")
        if not enunciado:
            avisos.append("Enunciado vazio.")

        cargo = b["prova"].rstrip(". …").split(" - ")[-1].strip() if b["prova"] else ""
        questoes.append({
            "numero": b["numero"],
            "codigo_externo": b["codigo_externo"],
            "materia": materia,
            "assunto": assunto,
            "banca": b["banca"],
            "ano": b["ano"],
            "orgao": b["orgao"],
            "cargo": cargo,
            "prova": b["prova"],
            "tipo": tipo,
            "enunciado": enunciado,
            "alternativas": [{"letra": l, "texto": t} for l, t in zip(letras, textos)],
            "gabarito": letra_gab,
            "avisos": avisos,
        })

    avisos_gerais = list(leitura.avisos)
    if not blocos:
        avisos_gerais.append("Nenhuma questão encontrada. O PDF está no formato de impressão do Qconcursos?")
    if blocos and not gabarito:
        avisos_gerais.append("Bloco 'Respostas' (gabarito) não encontrado.")
    return {"questoes": questoes, "avisos": avisos_gerais, "usou_ocr": leitura.usou_ocr}


def ler_prova(caminho, forcar_ocr: bool = False, progresso=None) -> dict:
    caminho = Path(caminho)
    if caminho.suffix.lower() == ".json":
        with open(caminho, encoding="utf-8") as f:
            return json.load(f)
    if caminho.suffix.lower() in (".xlsx", ".xlsm"):
        from .planilha import ler_planilha
        return ler_planilha(caminho)
    return interpretar(ler_pdf(caminho, forcar_ocr=forcar_ocr, progresso=progresso))


# ---------------------------------------------------------------------------
# Gravação no banco
# ---------------------------------------------------------------------------
MATERIA_PADRAO = "Não classificada"


def salvar_questoes(dados: dict, publicar: bool = False) -> dict:
    """
    Grava as questões. Por padrão entram como RASCUNHO para revisão no admin.
    Com publicar=True, as questões sem nenhum aviso já entram como ATIVAS.
    Questões já cadastradas são ignoradas: mesmo código externo (ex.: Q2178820)
    ou, quando não há código, o mesmo enunciado.
    """
    from django.db import transaction

    from .models import Alternativa, Assunto, Banca, Materia, Questao

    resumo = {"criadas": 0, "ativas": 0, "rascunho": 0, "duplicadas": 0, "ids": []}
    with transaction.atomic():
        for q in dados.get("questoes", []):
            codigo = (q.get("codigo_externo") or "").strip()
            enunciado = (q.get("enunciado") or "").strip()
            if codigo:
                existe = Questao.objects.filter(codigo_externo=codigo).exists()
            else:
                existe = bool(enunciado) and Questao.objects.filter(enunciado=enunciado).exists()
            if existe:
                resumo["duplicadas"] += 1
                continue

            nome_materia = (q.get("materia") or MATERIA_PADRAO).strip()
            materia = Materia.objects.filter(nome__iexact=nome_materia).first() \
                or Materia.objects.create(nome=nome_materia)
            assunto = None
            if q.get("assunto"):
                assunto = Assunto.objects.filter(materia=materia, nome__iexact=q["assunto"]).first() \
                    or Assunto.objects.create(materia=materia, nome=q["assunto"][:150])
            banca = None
            if q.get("banca"):
                sigla = q["banca"].replace(" / ", "/")[:30]
                banca, _ = Banca.objects.get_or_create(sigla=sigla, defaults={"nome": q["banca"]})

            avisos = list(q.get("avisos") or [])
            alternativas = q.get("alternativas") or []
            gabarito = q.get("gabarito")
            valida = len(alternativas) >= 2 and gabarito in [a["letra"] for a in alternativas]
            ativa = publicar and valida and not avisos

            questao = Questao.objects.create(
                materia=materia, assunto=assunto, banca=banca, ano=q.get("ano"),
                orgao=(q.get("orgao") or "")[:150], cargo=(q.get("cargo") or "")[:150],
                prova=(q.get("prova") or "")[:255], codigo_externo=codigo[:30],
                tipo=q.get("tipo") or Questao.Tipo.MULTIPLA_ESCOLHA,
                enunciado=enunciado or "(enunciado não identificado)",
                explicacao=q.get("explicacao") or "",
                dificuldade=q.get("dificuldade") if q.get("dificuldade") in (1, 2, 3) else 2,
                status=Questao.Status.ATIVA if ativa else Questao.Status.RASCUNHO,
                nota_importacao="\n".join(avisos),
            )
            Alternativa.objects.bulk_create(
                Alternativa(questao=questao, letra=a["letra"], texto=a["texto"] or "?",
                            correta=(a["letra"] == gabarito))
                for a in alternativas
            )
            resumo["criadas"] += 1
            resumo["ativas" if ativa else "rascunho"] += 1
            resumo["ids"].append(questao.id)
    return resumo


def salvar_json(dados: dict, caminho) -> None:
    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=2)
