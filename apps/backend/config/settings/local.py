from .base import *
import os

DEBUG = True

SECRET_KEY = os.environ.get('SECRET_KEY', 'local-dev-secret-key-not-for-production')

ALLOWED_HOSTS = ['localhost', '127.0.0.1', 'backend']

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('POSTGRES_DB'),
        'USER': os.environ.get('POSTGRES_USER'),
        'PASSWORD': os.environ.get('POSTGRES_PASSWORD'),
        'HOST': os.environ.get('POSTGRES_HOST', 'postgres'),
        'PORT': os.environ.get('POSTGRES_PORT', '5432'),
    }
}

EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'

CORS_ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
]

REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    'DEFAULT_RENDERER_CLASSES': (
        'rest_framework.renderers.JSONRenderer',
        'rest_framework.renderers.BrowsableAPIRenderer',
    ),
    # Les vérifications automatiques (audit Playwright, apps/frontend/e2e) envoient
    # des centaines de requêtes par passage : 'user' et 'anon' sont relevées en
    # local uniquement.
    # 'auth' et 'resend_email' gardent les valeurs de base, couvertes par les tests.
    'DEFAULT_THROTTLE_RATES': {
        **REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'],
        'anon': '10000/hour',
        'user': '100000/hour',
    },
}
