from pathlib import Path
from urllib.parse import urlsplit
import os

from apps.core.sentry import init_sentry

BASE_DIR = Path(__file__).resolve().parent.parent.parent

SECRET_KEY = os.environ.get('SECRET_KEY', 'change-me-in-production')

DEBUG = False

ALLOWED_HOSTS = []

DJANGO_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
]

THIRD_PARTY_APPS = [
    'rest_framework',
    'rest_framework_simplejwt',
    # Liste noire des jetons de rafraîchissement : rotation, déconnexion,
    # changement de mot de passe.
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'axes',
]

LOCAL_APPS = [
    'apps.core',
    'apps.accounts',
    'apps.shops',
    'apps.products',
    'apps.stock',
    'apps.customers',
    'apps.orders',
    'apps.notes',
    'apps.zakat',
    'apps.invoices',
    'apps.comms',
    'apps.public_pages',
    'apps.subscriptions',
    'apps.ocr',
    'apps.loyalty',
    'apps.exports',
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    # En tête : /healthz répond avant la validation de l'hôte (apps/core/health.py).
    'apps.core.health.HealthCheckMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'axes.middleware.AxesMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('POSTGRES_DB', 'mizan'),
        'USER': os.environ.get('POSTGRES_USER', 'mizan'),
        'PASSWORD': os.environ.get('POSTGRES_PASSWORD', 'mizan'),
        'HOST': os.environ.get('POSTGRES_HOST', 'postgres'),
        'PORT': os.environ.get('POSTGRES_PORT', '5432'),
    }
}

AUTH_USER_MODEL = 'accounts.User'

AUTHENTICATION_BACKENDS = [
    'axes.backends.AxesStandaloneBackend',
    'django.contrib.auth.backends.ModelBackend',
]

# django-axes — anti brute-force sur /admin/login/ et endpoints d'auth
AXES_FAILURE_LIMIT = 5
AXES_COOLOFF_TIME = 1  # heure(s) avant déblocage
AXES_RESET_ON_SUCCESS = True
AXES_LOCKOUT_PARAMETERS = ['ip_address', 'username']
# Adresse du visiteur, même clé que la limitation de DRF (dernière entrée de
# X-Forwarded-For, IPv6 par /64) : REMOTE_ADDR est celle du conteneur Next.js.
AXES_CLIENT_IP_CALLABLE = 'apps.core.throttling.axes_client_ip'

# reCAPTCHA v3 — désactivé si la clé secrète est vide (dev / tests).
RECAPTCHA_SECRET_KEY = os.environ.get('RECAPTCHA_SECRET_KEY', '')
RECAPTCHA_MIN_SCORE = float(os.environ.get('RECAPTCHA_MIN_SCORE', '0.5'))

# Stripe Billing — facturation désactivée si la clé secrète est vide (dev / tests).
# Staging : clé de test `sk_test_…` ; production : clé restreinte `rk_live_…`.
# Jamais de clé dans un log : apps/subscriptions/stripe_client.py.
STRIPE_SECRET_KEY = os.environ.get('STRIPE_SECRET_KEY', '')
# Secret de signature des webhooks (`whsec_…`), propre à chaque endpoint Stripe.
STRIPE_WEBHOOK_SECRET = os.environ.get('STRIPE_WEBHOOK_SECRET', '')

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},  # noqa: E501
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'fr-fr'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = os.environ.get('EMAIL_HOST', 'smtp.sendgrid.net')
EMAIL_PORT = int(os.environ.get('EMAIL_PORT', 587))
EMAIL_USE_TLS = True
EMAIL_HOST_USER = os.environ.get('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.environ.get('EMAIL_HOST_PASSWORD', '')
DEFAULT_FROM_EMAIL = os.environ.get('DEFAULT_FROM_EMAIL', 'noreply@mizan.app')
FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:3000')
# Validité du lien de vérification d'e-mail, en secondes (apps/accounts/tokens.py).
# Indépendante de PASSWORD_RESET_TIMEOUT, qui reste celle du lien de réinitialisation.
EMAIL_VERIFICATION_TIMEOUT = 60 * 60 * 24 * 7
# Adresse de contact donnée en fin des e-mails envoyés aux commerçants.
SUPPORT_EMAIL = os.environ.get('SUPPORT_EMAIL', 'support@mizan-commerce.com')

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'apps.shops.authentication.ShopMemberJWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_RENDERER_CLASSES': (
        'rest_framework.renderers.JSONRenderer',
    ),
    'DEFAULT_PAGINATION_CLASS': 'apps.core.pagination.FlexiblePageNumberPagination',
    'PAGE_SIZE': 20,
    # Compteurs partagés entre processus (cache 'throttle') : apps/core/throttling.py.
    'DEFAULT_THROTTLE_CLASSES': (
        'apps.core.throttling.AnonRateThrottle',
        'apps.core.throttling.UserRateThrottle',
    ),
    # IP d'un visiteur : dernière entrée de X-Forwarded-For, posée par le proxy
    # Next.js (lib/client-ip.ts) ou par Caddy pour les routes Django exposées.
    'NUM_PROXIES': 1,
    'DEFAULT_THROTTLE_RATES': {
        'anon': '100/hour',
        'user': '1000/hour',
        'auth': '10/minute',       # login, register, password reset, refresh
        'resend_email': '3/hour',  # renvoi du lien de vérification email
        'product_scan': '10/minute',  # scan d'emballage (OCR, secours vision payant)
        # Exports PDF et WhatsApp (rendu serveur) ; relevé dans la pile locale
        # (docker-compose.yml), où tournent les audits.
        'exports_render': os.environ.get('EXPORTS_RENDER_RATE', '10/minute'),
        # Facturation Stripe : chaque appel interroge Stripe (sessions, liste).
        'billing_checkout': '10/hour',
        'billing_portal': '10/hour',
        'billing_refresh': '30/hour',
    },
    'EXCEPTION_HANDLER': 'apps.core.exceptions.api_exception_handler',
}

from datetime import timedelta  # noqa: E402

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=60),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=30),
    'ROTATE_REFRESH_TOKENS': True,
    # Un jeton de rafraîchissement ne sert qu'une fois : réutilisé, il est refusé.
    'BLACKLIST_AFTER_ROTATION': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
    'UPDATE_LAST_LOGIN': True,
}

CORS_ALLOWED_ORIGINS = []
CORS_ALLOW_CREDENTIALS = True

# Object Storage (OVH S3-compatible — désactivé si les vars ne sont pas définies)
# Bucket sans valeur par défaut : chaque environnement nomme le sien
# (production.py refuse de démarrer sans lui).
AWS_ACCESS_KEY_ID = os.environ.get('OVH_S3_ACCESS_KEY', '')
AWS_SECRET_ACCESS_KEY = os.environ.get('OVH_S3_SECRET_KEY', '')
AWS_STORAGE_BUCKET_NAME = os.environ.get('OVH_S3_BUCKET_PRIVATE', '')
AWS_S3_ENDPOINT_URL = os.environ.get('OVH_S3_ENDPOINT_URL', '')
AWS_S3_REGION_NAME = os.environ.get('OVH_S3_REGION', 'gra')
AWS_DEFAULT_ACL = 'private'
AWS_S3_FILE_OVERWRITE = False
AWS_QUERYSTRING_EXPIRE = 3600  # URL signées valides 1h
PRODUCT_IMAGE_MAX_SIZE_MB = 5
PRODUCT_IMAGE_ALLOWED_TYPES = {'image/jpeg', 'image/png', 'image/webp'}

# OCR — photo ou PDF de facture fournisseur (URS-042). Volontairement distinct
# des constantes PRODUCT_IMAGE_* : les deux domaines évoluent indépendamment.
OCR_DOCUMENT_MAX_SIZE_MB = 10
OCR_DOCUMENT_ALLOWED_TYPES = {
    'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
}
# Pages d'une facture PDF (même borne côté ai-service : app/pdf.py).
OCR_PDF_MAX_PAGES = 5

# Scan d'emballage (URS-109) : photo lue en mémoire, jamais stockée. Même borne
# côté ai-service (app/file_validation.py).
PRODUCT_SCAN_MAX_SIZE_MB = 8
PRODUCT_SCAN_ALLOWED_TYPES = {'image/jpeg', 'image/png', 'image/webp'}
# Secours vision demandé seulement si la confiance du nom reste sous ce seuil
# après code-barres, Open Food Facts et OCR local.
PRODUCT_SCAN_VISION_THRESHOLD = float(
    os.environ.get('PRODUCT_SCAN_VISION_THRESHOLD', '0.7'),
)
# Sous cette confiance, un champ n'est pas proposé (il vaut null).
PRODUCT_SCAN_MIN_CONFIDENCE = 0.5


def ai_provider_enabled(value: str | None) -> bool:
    """Fournisseur IA configuré : `VISION_PROVIDER` ni vide ni `none`."""
    return (value or '').strip().lower() not in ('', 'none')


# Lectures avancées (structuration du texte par le fournisseur IA) : même
# variable qu'ai-service, qui doit lire la même valeur. Faux : Django ne demande
# jamais la structuration (aucun appel payant) et masque jauge et ligne de
# formule. Limite connue : `openai` sans clé côté ai-service laisse ce réglage
# vrai ; ai-service répond alors `disabled` et la place réservée est rendue.
PRODUCT_SCAN_AI_ENABLED = ai_provider_enabled(os.environ.get('VISION_PROVIDER'))
# Photo du dos envoyée après la face : le même scan, sans nouvelle place, si
# elle arrive dans ce délai (empreinte de la face gardée dans Redis).
PRODUCT_SCAN_BACK_GRACE_SECONDS = 15 * 60

# Open Food Facts : seul l'EAN, validé, sort vers ce domaine fixe. Réponses
# gardées 30 jours dans Redis (une fiche produit change rarement).
OPEN_FOOD_FACTS_TIMEOUT_SECONDS = 3.0
OPEN_FOOD_FACTS_CACHE_SECONDS = 30 * 24 * 3600



def _redis_url_with_db(url: str, db: int) -> str:
    """Même serveur Redis (hôte, mot de passe), autre base numérotée."""
    return urlsplit(url)._replace(path=f'/{db}').geturl()


# Caches Redis dédiés (limitation de débit, recherches externes, scans) ; le
# cache par défaut reste en mémoire locale. Délais courts : un Redis lent ne
# doit retarder ni une requête ni un scan.
CACHES = {
    'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'},
    # Limitation de débit DRF : compteurs communs à tous les processus. Base
    # Redis 1, distincte de celle de Celery (0) : un FLUSHDB de l'une ne touche
    # pas l'autre. Panne de Redis : la limitation s'ouvre (apps/core/throttling.py).
    'throttle': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': _redis_url_with_db(
            os.environ.get('REDIS_URL', 'redis://redis:6379/0'), 1,
        ),
        'KEY_PREFIX': 'throttle',
        'OPTIONS': {'socket_connect_timeout': 1, 'socket_timeout': 1},
    },
    'product_lookups': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': os.environ.get('REDIS_URL', 'redis://redis:6379/0'),
        'KEY_PREFIX': 'product-lookup',
        'OPTIONS': {'socket_connect_timeout': 1, 'socket_timeout': 1},
    },
    # Scan d'emballage : empreintes de face en attente d'une photo du dos.
    # Partagé entre processus (Redis) : la face et le dos peuvent arriver sur
    # deux workers différents.
    'product_scans': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': os.environ.get('REDIS_URL', 'redis://redis:6379/0'),
        'KEY_PREFIX': 'product-scan',
        'OPTIONS': {'socket_connect_timeout': 1, 'socket_timeout': 1},
    },
}

# Celery
CELERY_BROKER_URL = os.environ.get('REDIS_URL', 'redis://redis:6379/0')
CELERY_RESULT_BACKEND = os.environ.get('REDIS_URL', 'redis://redis:6379/0')
CELERY_TIMEZONE = 'UTC'

# Les tâches OCR sont routées vers une queue dédiée pour isoler leur charge
# du worker généraliste (voir docker-compose : service `celery-ocr`).
CELERY_TASK_ROUTES = {
    'apps.ocr.tasks.*': {'queue': 'ocr'},
}

from celery.schedules import crontab  # noqa: E402

CELERY_BEAT_SCHEDULE = {
    'zakat-reminders-daily': {
        'task': 'apps.zakat.tasks.send_zakat_reminders',
        'schedule': crontab(hour=6, minute=0),  # chaque jour à 6h UTC
    },
    'subscriptions-expire-trials-daily': {
        'task': 'apps.subscriptions.tasks.expire_trials',
        'schedule': crontab(hour=6, minute=30),  # juste après les rappels zakat
    },
    # Rattrape un webhook Stripe perdu : chaque abonnement Stripe est redemandé.
    'subscriptions-reconcile-stripe-daily': {
        'task': 'apps.subscriptions.tasks.reconcile_subscriptions',
        'schedule': crontab(hour=7, minute=0),
    },
    # Facturation : rappel de fin d'essai (24 h avant) et retard de paiement.
    'subscriptions-trial-ending-notices': {
        'task': 'apps.subscriptions.tasks.send_trial_ending_notices',
        'schedule': crontab(minute='*/15'),
    },
    'subscriptions-past-due': {
        'task': 'apps.subscriptions.tasks.process_past_due_subscriptions',
        'schedule': crontab(minute='*/15'),
    },
    # Purge des jetons de rafraîchissement expirés (liste noire comprise).
    'accounts-flush-expired-tokens-daily': {
        'task': 'apps.accounts.tasks.flush_expired_tokens',
        'schedule': crontab(hour=3, minute=0),
    },
    # Toutes les heures : chaque boutique est traitée à son heure locale.
    'notes-automatic-reminders-hourly': {
        'task': 'apps.notes.tasks.run_automatic_reminders',
        'schedule': crontab(minute=0),
    },
}

# Service IA / OCR (FastAPI séparé — V6). Accessible uniquement en réseau
# Docker interne ; jamais publié via Caddy. La clé ne doit avoir aucune
# valeur par défaut : mieux vaut un 401 clair qu'un défaut faible en dur.
AI_SERVICE_URL = os.environ.get('AI_SERVICE_URL', 'http://ai-service:8000')
AI_SERVICE_API_KEY = os.environ.get('AI_SERVICE_API_KEY', '')
AI_SERVICE_TIMEOUT_SECONDS = float(os.environ.get('AI_SERVICE_TIMEOUT_SECONDS', '5'))
# Timeout dédié à l'inférence OCR — beaucoup plus large que les sondes health :
# le premier appel dans un worker déclenche le chargement du pipeline PaddleOCR
# (téléchargement + chargement modèles ~15 s) puis l'inférence proprement dite.
# Un PDF scanné de 5 pages, c'est 5 lectures d'image : d'où 180 s.
AI_SERVICE_OCR_TIMEOUT_SECONDS = float(os.environ.get('AI_SERVICE_OCR_TIMEOUT_SECONDS', '180'))  # noqa: E501
# Timeout dédié à la structuration LLM (POC 6B). Doit rester légèrement
# supérieur au timeout OpenAI configuré côté ai-service (par défaut 45 s) :
# on veut que FastAPI puisse gérer son propre timeout et renvoyer un 502
# propre plutôt que voir httpx couper la connexion prématurément.
AI_SERVICE_INVOICE_TIMEOUT_SECONDS = float(
    os.environ.get('AI_SERVICE_INVOICE_TIMEOUT_SECONDS', '50'),
)
# Timeout dédié au scan d'emballage, appliqué à chaque appel. Lecture locale :
# OCR d'une ou deux photos puis structuration du texte (`PRODUCT_TEXT_TIMEOUT_SECONDS`,
# 15 s par défaut). Secours image : doit rester supérieur à `VISION_TIMEOUT_SECONDS`
# (30 s par défaut) pour que FastAPI renvoie son propre 502.
AI_SERVICE_PRODUCT_SCAN_TIMEOUT_SECONDS = float(
    os.environ.get('AI_SERVICE_PRODUCT_SCAN_TIMEOUT_SECONDS', '40'),
)

# Suivi des erreurs : actif seulement si SENTRY_DSN est défini (apps/core/sentry.py).
init_sentry()
