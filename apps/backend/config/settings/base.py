from pathlib import Path
import os

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
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
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

# reCAPTCHA v3 — désactivé si la clé secrète est vide (dev / tests).
RECAPTCHA_SECRET_KEY = os.environ.get('RECAPTCHA_SECRET_KEY', '')
RECAPTCHA_MIN_SCORE = float(os.environ.get('RECAPTCHA_MIN_SCORE', '0.5'))

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
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

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_RENDERER_CLASSES': (
        'rest_framework.renderers.JSONRenderer',
    ),
    'DEFAULT_PAGINATION_CLASS': 'apps.core.pagination.FlexiblePageNumberPagination',
    'PAGE_SIZE': 20,
    'DEFAULT_THROTTLE_CLASSES': (
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ),
    'DEFAULT_THROTTLE_RATES': {
        'anon': '100/hour',
        'user': '1000/hour',
        'auth': '10/minute',       # login, register, password reset, refresh
        'resend_email': '3/hour',  # renvoi du lien de vérification email
    },
    'EXCEPTION_HANDLER': 'apps.core.exceptions.api_exception_handler',
}

from datetime import timedelta

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=60),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=30),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': False,
    'AUTH_HEADER_TYPES': ('Bearer',),
    'UPDATE_LAST_LOGIN': True,
}

CORS_ALLOWED_ORIGINS = []
CORS_ALLOW_CREDENTIALS = True

# Object Storage (OVH S3-compatible — désactivé si les vars ne sont pas définies)
AWS_ACCESS_KEY_ID = os.environ.get('OVH_S3_ACCESS_KEY', '')
AWS_SECRET_ACCESS_KEY = os.environ.get('OVH_S3_SECRET_KEY', '')
AWS_STORAGE_BUCKET_NAME = os.environ.get('OVH_S3_BUCKET_PRIVATE', 'mizan-private')
AWS_S3_ENDPOINT_URL = os.environ.get('OVH_S3_ENDPOINT_URL', '')
AWS_S3_REGION_NAME = os.environ.get('OVH_S3_REGION', 'gra')
AWS_DEFAULT_ACL = 'private'
AWS_S3_FILE_OVERWRITE = False
AWS_QUERYSTRING_EXPIRE = 3600  # URL signées valides 1h
PRODUCT_IMAGE_MAX_SIZE_MB = 5
PRODUCT_IMAGE_ALLOWED_TYPES = {'image/jpeg', 'image/png', 'image/webp'}

# Celery
CELERY_BROKER_URL = os.environ.get('REDIS_URL', 'redis://redis:6379/0')
CELERY_RESULT_BACKEND = os.environ.get('REDIS_URL', 'redis://redis:6379/0')
CELERY_TIMEZONE = 'UTC'

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
}
