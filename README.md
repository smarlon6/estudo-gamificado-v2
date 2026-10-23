# Estudo Gamificado

Site pessoal de questões de concursos com gamificação: XP, níveis por matéria,
meta diária, ofensiva, ouro, diamantes, troféus, ligas, trilha de recompensas,
conquistas e revisão espaçada dos erros.

- **backend/**: Django 5 + Django REST Framework (SQLite no desenvolvimento)
- **frontend/**: app de celular — React 19 + TypeScript + Vite + Tailwind CSS 4 + Framer Motion (porta 5173)
- **frontend-web/**: versão para navegador (desktop) — mesmo backend, projeto independente (porta 5174)

## Como rodar

### 1. Backend (porta 8000)

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate    |    Linux/Mac: source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py popular_demo --usuario marlon --senha SUA_SENHA
python manage.py runserver
```

O comando `popular_demo` cria as matérias, 10 questões de exemplo, as conquistas,
os marcos da trilha e o seu usuário (superusuário). Pode rodar de novo sem duplicar nada.

### 2. Frontend (porta 5173)

Em outro terminal:

```bash
cd frontend
npm install
npm run dev
```

Abra **http://localhost:5173** e entre com o usuário criado.
O admin para cadastrar questões fica em **http://localhost:5173/admin/**
(o Vite repassa `/api` e `/admin` para o Django, então tudo funciona na mesma origem).

### 3. Front web / desktop (porta 5174)

Em mais um terminal (o backend precisa estar rodando):

```bash
cd frontend-web
npm install
npm run dev
```

Abra **http://localhost:5174**. Pode rodar junto com o app de celular: os dois usam o mesmo backend e os mesmos dados.

Atalhos na tela de questões: `A`–`E` escolhem a alternativa (`C`/`E` em certo/errado), `Enter` confirma e avança,
`N` abre a anotação, `S` pula, `L` lê em voz alta (a questão, ou a explicação depois de responder), `Esc` volta ao início. Na tela inicial, `Enter` abre a missão diária.

### Acesso pelo celular ou outro computador da rede

Os dois fronts já vêm configurados para a rede local (`host: true` no Vite e `ALLOWED_HOSTS` liberado em modo de
desenvolvimento). Rode `ipconfig`, pegue o "Endereço IPv4" e abra `http://SEU_IP:5173` (celular) ou
`http://SEU_IP:5174` (web). Se não abrir, libere o Node.js no Firewall do Windows para redes privadas.

### Testes

```bash
cd backend
python manage.py test jogo
```

## Batalha (app do celular)

Na tela inicial, card **Batalha** › **Lutar**. Cada acerto mostra seu ataque e tira vida do inimigo; cada erro
mostra o inimigo te acertando. Zerou a vida do inimigo: vitória e recompensa. Zerou a sua: derrota.

- Vida do inimigo, prêmio e novos inimigos: Admin › Jogo › **Inimigos**.
- Suas vidas e troféus da vitória: `settings.JOGO["BATALHA"]`.
- Imagens de cada inimigo em `frontend/public/batalha/<slug>/`: `encarando`, `ataque`, `dano`, `vitoria`,
  `derrota` (1080 × 400) e `retrato-heroi`, `retrato-inimigo` (160 × 160), em `.webp`.

## Importar questões por planilha Excel

1. Baixe o modelo em Admin › Questões › **Importar questões** › **Baixar planilha modelo**
   (ou gere pelo terminal: `python manage.py gerar_modelo_excel`).
2. Preencha a aba **Questões**: uma linha por questão. A aba **Como preencher** explica cada coluna.
3. Importe pela mesma tela (marque *Publicar automaticamente*) ou pelo terminal:

```bash
python manage.py importar_prova C:\caminho\minhas_questoes.xlsx --publicar
```

Linhas com problema (gabarito vazio, matéria faltando...) entram como rascunho com um aviso
indicando o número da linha. Reimportar a mesma planilha não duplica nada.

## Importar provas em PDF

O importador lê o PDF de impressão do Qconcursos (questões + bloco **Respostas** no final),
identifica matéria, assunto, banca, ano, órgão, cargo, enunciado, alternativas e gabarito,
e grava tudo como **rascunho** para você revisar antes de aparecer no jogo.

**Pelo admin:** Questões → botão **Importar prova (PDF)** → escolha o arquivo → Importar.
Depois filtre por *Status: Rascunho* e *Avisos da importação: Com avisos*, confira e use a ação
**Publicar (ativar) as questões selecionadas**.

**Pelo terminal:**

```bash
python manage.py importar_prova C:\caminho\prova.pdf                 # importa como rascunho
python manage.py importar_prova prova.pdf --json prova.json --apenas-json   # só gera JSON para conferir
python manage.py importar_prova prova.json --publicar                 # importa o JSON já conferido
```

Questões repetidas (mesmo código, ex.: `Q2178820`) são ignoradas, então pode importar
provas que tenham questões em comum sem duplicar nada.

### PDF com texto x PDF como imagem (OCR)

- **PDF com texto selecionável:** funciona direto, em segundos.
- **PDF gerado como imagem** (ex.: impresso com *Microsoft Print to PDF*): precisa de OCR.
  Leva cerca de 15 segundos por página. Para ativar no Windows:
  1. Baixe o instalador do Tesseract em https://github.com/UB-Mannheim/tesseract/wiki
  2. Na instalação, em *Additional language data*, marque **Portuguese**.
  3. Mantenha a pasta padrão `C:\Program Files\Tesseract-OCR`: o app encontra sozinho.
     (Se instalar em outra pasta, defina a variável de ambiente `TESSERACT_CMD` com o caminho do `tesseract.exe`.)

**Dica:** ao imprimir pelo navegador, prefira o destino **Salvar como PDF** do Chrome em vez de
*Microsoft Print to PDF*. Ele normalmente mantém o texto, e aí o OCR nem é necessário.

### O que conferir na revisão

O importador marca avisos nas questões que precisam de atenção:
- **Matéria não definida** (a prova veio como "Não definido"): escolha a matéria.
- **Pode depender de figura/tabela**: o app ainda não guarda imagens; confira se dá para resolver só com o texto.
- **Gabarito não encontrado** ou alternativas incompletas.

Erros de OCR em palavras isoladas também podem acontecer (ex.: "Éticana" em vez de "Ética na").

## Estrutura

```
backend/
  config/settings.py      ← configurações + bloco JOGO com todas as regras numéricas
  questoes/               ← Materia, Assunto, Banca, Questao, Alternativa (+ admin)
  jogo/
    models.py             ← Perfil, Resposta, ProgressoDiario, Revisao, Transacao,
                            Conquista, MarcoTrilha, NivelMateria, Anotacao
    services.py           ← TODA a lógica do jogo (XP, ofensiva, revisão, conquistas)
    views.py / urls.py    ← API REST
    management/commands/popular_demo.py
    tests.py              ← testes das regras
frontend-web/src/          ← front web (desktop), independente do app de celular
  components/Layout.tsx   ← menu lateral
  components/Calendario.tsx, GraficoSemanal.tsx
  pages/                  ← Inicio, Questoes (com atalhos de teclado), Estatisticas, Liga, Login
frontend/src/
  api.ts                  ← fetch com sessão + CSRF
  types.ts                ← tipos das respostas da API
  pages/                  ← Inicio, Jogar, Liga, Estatisticas, Login
  components/             ← Layout (menu inferior), ModalRecompensa, Icone, ui
```

## Regras do jogo (ajustáveis em `settings.JOGO`)

| Regra | Valor padrão |
|---|---|
| XP por acerto | 10 / 15 / 20 (fácil / média / difícil) |
| Bônus de combo | +1 XP por acerto seguido, até +5 |
| Questão já acertada antes | rende 30% do XP e não mexe em troféus (anti-farm) |
| Resposta em menos de 5s | XP pela metade (anti-chute) |
| Troféus | +3 no acerto, −1 no erro (nunca negativo) |
| Meta diária | 20 questões → +50 ouro, +3 diamantes, +25 troféus |
| Ofensiva | +1 por dia com meta batida; congeladores protegem dias perdidos |
| Revisão: erro | volta em ~10 min (reforço, sem troféus); cada erro reduz a "facilidade" da questão |
| Revisão: acerto | reforço → 1 dia; depois intervalo × facilidade (2,5): 1 → 3 → 8 → 20 → 50 dias |
| Revisão: ritmo | acertou em ≤60% do seu tempo médio → intervalo maior; ≥150% → intervalo menor |
| Questão teimosa | 3+ erros → intervalo máximo de 7 dias |
| Questão aprendida | próximo intervalo passaria de 60 dias → sai da revisão |
| Missão diária | 1 a cada 4 questões é uma revisão vencida (a mais atrasada primeiro) |
| Batalha | cada acerto tira 1 de vida do inimigo (20 = 20 acertos para vencer); cada erro tira 1 das suas 5 vidas |
| Vitória na batalha | ouro e diamantes do inimigo (orc: +40 ouro, +1 diamante) e +10 troféus |
| Anotação própria | +5 ouro na primeira vez |
| Nível geral | subir do nível n para n+1 custa 200 × (n+1) XP |
| Nível da matéria | subir do nível n para n+1 custa 50 × (n+1) XP |

## API

| Método | Rota | O que faz |
|---|---|---|
| GET | `/api/csrf/` | Entrega o cookie CSRF |
| POST | `/api/auth/entrar/` | Login `{usuario, senha}` |
| POST | `/api/auth/sair/` | Logout |
| GET | `/api/auth/eu/` | Sessão ativa? |
| GET | `/api/painel/` | Dados da tela Início |
| GET | `/api/materias/` · `/api/bancas/` | Catálogo para filtros |
| GET | `/api/questoes/proxima/?modo=treino\|missao\|revisao&materia=slug&assunto=id&banca=id&excluir=1,2` | Próxima questão (sem gabarito) |
| POST | `/api/questoes/{id}/responder/` | `{alternativa_id, tempo_segundos, modo}` → resultado com XP |
| POST | `/api/questoes/{id}/anotacao/` | `{texto}` |
| POST | `/api/meta/coletar/` | Coleta o baú da meta diária |
| GET | `/api/trilha/` | Liga, marcos e comparativo semanal |
| POST | `/api/trilha/{id}/coletar/` | Coleta um marco da trilha |
| GET | `/api/estatisticas/` | Desempenho por matéria, pontos fracos, conquistas |
| GET | `/api/batalha/` | Batalha em andamento, inimigos, vitórias e derrotas |
| POST | `/api/batalha/iniciar/` | `{inimigo}` começa (ou retoma) a batalha |
| POST | `/api/batalha/responder/` | `{questao_id, alternativa_id, tempo_segundos}` → resultado + estado da batalha + evento (ataque, dano, vitoria, derrota) |
| POST | `/api/batalha/desistir/` | Encerra a batalha sem recompensa |
| GET | `/api/historico/` | Atividade diária (182 dias), acerto semanal (12 semanas), tendência por matéria, tempo médio, catálogo de conquistas |

## Próximos passos

1. Importação de provas em PDF com fila de revisão (status `rascunho`)
2. Modo simulado cronometrado com "fantasma" da tentativa anterior
3. Loja (gastar ouro e diamantes: congeladores, avatares, títulos)
4. Temporada mensal com reset parcial de troféus
