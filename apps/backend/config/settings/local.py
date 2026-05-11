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
        'HOST': os.environ.get('POSTGRES_HOST', 'postgres'),  # nom du service dans docker-compose
        'PORT': os.environ.get('POSTGRES_PORT', '5432'),
    }
}