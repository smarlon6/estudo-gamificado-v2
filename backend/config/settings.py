"""
Configurações do projeto Estudo Gamificado.

Para desenvolvimento local o banco é SQLite (zero configuração).
Para trocar para PostgreSQL depois, basta alterar DATABASES.
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-inseguro-troque-em-producao")
DEBUG = os.environ.get("DJANGO_DEBUG", "1") == "1"
ALLOWED_HOSTS = os.environ.get("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")
if DEBUG:
    ALLOWED_HOSTS = ["*"]  # em desenvolvimento, aceita acesso pelo IP da rede local (celular, outro PC)

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "questoes",
    "jogo",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
]

LANGUAGE_CODE = "pt-br"
TIME_ZONE = "America/Cuiaba"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Os fronts (Vite) usam proxy para /api: tudo fica na mesma origem e a sessão funciona sem CORS.
# Pelo IP da rede local, o proxy repassa o endereço original (changeOrigin: false) e a checagem passa.
CSRF_TRUSTED_ORIGINS = [
    "http://localhost:5173", "http://127.0.0.1:5173",  # app de celular
    "http://localhost:5174", "http://127.0.0.1:5174",  # front web
]

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
}

# ---------------------------------------------------------------------------
# Regras de gamificação (ajuste aqui sem mexer no código)
# ---------------------------------------------------------------------------
JOGO = {
    "META_DIARIA_PADRAO": 20,          # questões por dia
    "XP_POR_DIFICULDADE": {1: 10, 2: 15, 3: 20},
    "XP_COMBO_MAX": 5,                 # bônus máximo por combo
    "FATOR_XP_REPETIDA": 0.3,          # questão já acertada antes rende 30% do XP
    "TEMPO_MINIMO_SEGUNDOS": 5,        # abaixo disso o XP cai pela metade (anti-chute)
    "TROFEUS_ACERTO": 3,
    "TROFEUS_ERRO": -1,
    "RECOMPENSA_META": {"ouro": 50, "diamantes": 3, "trofeus": 25},
    "OURO_POR_ANOTACAO": 5,
    # Revisão espaçada adaptativa: errou volta em minutos; acertos multiplicam o intervalo
    "REVISAO": {
        "reforco_minutos": 10,          # errou: volta na mesma sessão depois de ~10 min
        "facilidade_inicial": 2.5,      # intervalo seguinte = anterior x facilidade (1 → 3 → 8 → 20 → 50)
        "facilidade_min": 1.3,
        "facilidade_max": 3.0,
        "penalidade_erro": 0.2,         # cada erro deixa a questão "mais difícil"
        "rapido": 0.6,                  # acertou em até 60% do seu tempo médio = fácil
        "bonus_rapido": 1.3,
        "ajuste_rapido": 0.1,
        "lento": 1.5,                   # demorou 150%+ do seu tempo médio = difícil
        "fator_lento": 0.6,
        "ajuste_lento": 0.15,
        "minimo_segundos_para_ritmo": 5,
        "teimosa_lapsos": 3,            # errou 3+ vezes: questão teimosa
        "teimosa_max_dias": 7,          # ...e o intervalo nunca passa de 7 dias
        "aprendida_apos_dias": 60,      # próximo intervalo passaria de 60 dias: sai da revisão
        "missao_revisao_a_cada": 4,     # na missão diária, 1 a cada 4 questões é revisão
    },
}
