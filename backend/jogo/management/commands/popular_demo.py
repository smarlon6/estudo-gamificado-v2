"""
Popula o banco com matérias, conquistas, trilha de troféus e algumas questões
de exemplo (escritas para teste, não são de provas reais).

Uso:
    python manage.py popular_demo --usuario marlon --senha minhasenha
"""
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from jogo.models import Conquista, MarcoTrilha
from jogo.services import obter_perfil
from questoes.models import Alternativa, Assunto, Banca, Materia, Questao

MATERIAS = {
    "Português": ("#4258D0", ["Concordância", "Crase", "Regência"]),
    "Direito Constitucional": ("#B5651D", ["Direitos fundamentais", "Organização do Estado"]),
    "Direito Administrativo": ("#138A52", ["Atos administrativos", "Princípios"]),
    "Raciocínio Lógico": ("#C2410C", ["Porcentagem", "Proposições"]),
    "Informática": ("#0E86A3", ["Segurança da informação", "Planilhas"]),
}

# (matéria, assunto, tipo, dificuldade, enunciado, [(letra, texto, correta)], explicação)
QUESTOES = [
    ("Português", "Crase", "ME", 1,
     "Assinale a frase em que o uso do acento grave está correto.",
     [("A", "Entreguei o relatório à ela.", False),
      ("B", "Vou à reunião amanhã cedo.", True),
      ("C", "Começou à chover forte.", False),
      ("D", "Fiquei frente à frente com o problema.", False),
      ("E", "Ele chegou à pé.", False)],
     "Há crase em 'vou à reunião' porque 'ir' exige a preposição 'a' e 'reunião' "
     "aceita o artigo 'a'. Não há crase antes de pronome pessoal, verbo, "
     "expressões com palavras repetidas nem antes de 'pé'."),
    ("Português", "Concordância", "CE", 2,
     "Na frase 'Fazem dois anos que estudo para concursos', a concordância verbal está correta.",
     [("Certo", "Certo", False), ("Errado", "Errado", True)],
     "O verbo 'fazer' indicando tempo decorrido é impessoal e fica no singular: "
     "'Faz dois anos que estudo para concursos'."),
    ("Direito Administrativo", "Atos administrativos", "ME", 2,
     "Qual atributo permite que a Administração execute seus atos diretamente, "
     "sem precisar de ordem judicial prévia?",
     [("A", "Presunção de legitimidade", False), ("B", "Tipicidade", False),
      ("C", "Autoexecutoriedade", True), ("D", "Imperatividade", False),
      ("E", "Motivação", False)],
     "Autoexecutoriedade é a possibilidade de a Administração pôr em execução suas "
     "decisões por meios próprios, sem intervenção prévia do Judiciário."),
    ("Direito Administrativo", "Princípios", "CE", 1,
     "O princípio da impessoalidade impede que a publicidade de atos e programas "
     "públicos contenha nomes ou imagens que caracterizem promoção pessoal de autoridades.",
     [("Certo", "Certo", True), ("Errado", "Errado", False)],
     "É o que prevê o art. 37, §1º, da Constituição: a publicidade deve ter caráter "
     "educativo, informativo ou de orientação social, sem promoção pessoal."),
    ("Direito Constitucional", "Direitos fundamentais", "ME", 2,
     "Qual remédio constitucional protege o direito de locomoção?",
     [("A", "Mandado de segurança", False), ("B", "Habeas data", False),
      ("C", "Habeas corpus", True), ("D", "Mandado de injunção", False),
      ("E", "Ação popular", False)],
     "O habeas corpus protege a liberdade de locomoção contra ilegalidade ou abuso de poder."),
    ("Direito Constitucional", "Organização do Estado", "CE", 2,
     "Os municípios são entes federativos dotados de autonomia política, administrativa e financeira.",
     [("Certo", "Certo", True), ("Errado", "Errado", False)],
     "A Constituição de 1988 incluiu os municípios como entes da federação (arts. 1º e 18)."),
    ("Raciocínio Lógico", "Porcentagem", "ME", 1,
     "Um produto de R$ 200,00 teve aumento de 10% e, depois, desconto de 10%. Qual o preço final?",
     [("A", "R$ 200,00", False), ("B", "R$ 198,00", True), ("C", "R$ 202,00", False),
      ("D", "R$ 190,00", False), ("E", "R$ 180,00", False)],
     "200 × 1,10 = 220. Depois, 220 × 0,90 = 198. Aumento e desconto de mesmo "
     "percentual não se anulam."),
    ("Raciocínio Lógico", "Proposições", "ME", 3,
     "Qual é a negação de 'Todo servidor é pontual'?",
     [("A", "Nenhum servidor é pontual.", False),
      ("B", "Algum servidor não é pontual.", True),
      ("C", "Todo servidor não é pontual.", False),
      ("D", "Algum servidor é pontual.", False),
      ("E", "Nenhum servidor deixa de ser pontual.", False)],
     "A negação de 'todo A é B' é 'algum A não é B'. Basta um contraexemplo."),
    ("Informática", "Segurança da informação", "CE", 1,
     "Phishing é uma técnica que tenta obter dados pessoais da vítima por meio de "
     "mensagens falsas que imitam instituições confiáveis.",
     [("Certo", "Certo", True), ("Errado", "Errado", False)],
     "Phishing usa e-mails, sites ou mensagens falsificados para enganar o usuário "
     "e capturar senhas e dados."),
    ("Informática", "Planilhas", "ME", 2,
     "Em uma planilha, qual fórmula soma os valores das células A1 até A10?",
     [("A", "=SOMA(A1;A10)", False), ("B", "=SOMA(A1:A10)", True),
      ("C", "=SOMAR(A1-A10)", False), ("D", "=TOTAL(A1:A10)", False),
      ("E", "=A1+A10", False)],
     "Os dois-pontos indicam intervalo. '=SOMA(A1;A10)' somaria apenas as duas células."),
]

CONQUISTAS = [
    ("primeira-questao", "Primeiro passo", "Responda sua primeira questão", "estrela",
     "total_respostas", 1, 10, 0),
    ("100-questoes", "Centena", "Responda 100 questões", "medalha",
     "total_respostas", 100, 50, 2),
    ("1000-questoes", "Maratonista", "Responda 1.000 questões", "medalha",
     "total_respostas", 1000, 200, 10),
    ("ofensiva-7", "Semana firme", "Bata a meta 7 dias seguidos", "chama",
     "ofensiva", 7, 70, 3),
    ("ofensiva-30", "Mês de ferro", "Bata a meta 30 dias seguidos", "chama",
     "ofensiva", 30, 300, 15),
    ("combo-10", "Em chamas", "Acerte 10 questões seguidas", "raio", "combo", 10, 40, 1),
    ("combo-25", "Imparável", "Acerte 25 questões seguidas", "raio", "combo", 25, 120, 5),
    ("nivel-10", "Veterano", "Alcance o nível 10", "trofeu", "nivel", 10, 100, 5),
]

MARCOS = [
    (100, "Baú pequeno", 30, 0), (300, "Baú médio · Liga Prata", 60, 2),
    (600, "Baú grande · Liga Ouro", 100, 5), (900, "Baú grande", 100, 5),
    (1000, "Título 'Concurseiro Dedicado'", 150, 5),
    (1300, "Baú lendário · Liga Diamante", 250, 15), (2300, "Coroa · Liga Mestre", 500, 30),
]


class Command(BaseCommand):
    help = "Popula o banco com dados de exemplo para testar o jogo."

    def add_arguments(self, parser):
        parser.add_argument("--usuario", help="Cria (se não existir) um superusuário com este nome")
        parser.add_argument("--senha", help="Senha do superusuário criado")

    @transaction.atomic
    def handle(self, *args, **opts):
        banca, _ = Banca.objects.get_or_create(sigla="EXEMPLO", defaults={"nome": "Questões de exemplo"})

        materias = {}
        for ordem, (nome, (cor, assuntos)) in enumerate(MATERIAS.items()):
            m, _ = Materia.objects.get_or_create(nome=nome, defaults={"cor": cor, "ordem": ordem})
            materias[nome] = m
            for a in assuntos:
                Assunto.objects.get_or_create(materia=m, nome=a)

        criadas = 0
        for mat, ass, tipo, dif, enunciado, alts, explicacao in QUESTOES:
            if Questao.objects.filter(enunciado=enunciado).exists():
                continue
            q = Questao.objects.create(
                materia=materias[mat], assunto=Assunto.objects.get(materia=materias[mat], nome=ass),
                banca=banca, ano=2026, tipo=tipo, dificuldade=dif,
                enunciado=enunciado, explicacao=explicacao,
            )
            Alternativa.objects.bulk_create(
                Alternativa(questao=q, letra=l, texto=t, correta=c) for l, t, c in alts
            )
            criadas += 1

        for codigo, nome, desc, icone, criterio, alvo, ouro, diam in CONQUISTAS:
            Conquista.objects.update_or_create(codigo=codigo, defaults=dict(
                nome=nome, descricao=desc, icone=icone, criterio=criterio,
                valor_alvo=alvo, recompensa_ouro=ouro, recompensa_diamantes=diam))

        for trofeus, titulo, ouro, diam in MARCOS:
            MarcoTrilha.objects.update_or_create(trofeus=trofeus, defaults=dict(
                titulo=titulo, recompensa_ouro=ouro, recompensa_diamantes=diam))

        if opts.get("usuario"):
            User = get_user_model()
            user = User.objects.filter(username=opts["usuario"]).first()
            if not user:
                if not opts.get("senha"):
                    self.stderr.write("Informe --senha para criar o usuário.")
                    return
                user = User.objects.create_superuser(opts["usuario"], "", opts["senha"])
                self.stdout.write(f"Superusuário '{user.username}' criado.")
            obter_perfil(user)

        if opts.get("verbosity", 1) > 0:
            self.stdout.write(self.style.SUCCESS(
                f"Pronto: {len(materias)} matérias, {criadas} questões novas, "
                f"{len(CONQUISTAS)} conquistas, {len(MARCOS)} marcos da trilha."
            ))
