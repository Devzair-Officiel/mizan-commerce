from .base import *

DEBUG = False

EMAIL_BACKEND = os.environ.get(
    "EMAIL_BACKEND", "django.core.mail.backends.smtp.EmailBackend"
)


def _required_env_list(name: str) -> list[str]:
    raw = os.environ.get(name, "").strip()
    if not raw:
        raise RuntimeError(
            f"Variable d'environnement {name!r} obligatoire en production "
            f"(liste séparée par des virgules)."
        )
    values = [v.strip() for v in raw.split(",") if v.strip()]
    if not values:
        raise RuntimeError(f"{name!r} ne peut pas être vide en production.")
    return values


if os.environ.get("SECRET_KEY") in (None, "", "change-me-in-production"):
    raise RuntimeError(
        "SECRET_KEY doit être défini en production (≥ 50 caractères, "
        "non issu de la valeur par défaut)."
    )

ALLOWED_HOSTS = _required_env_list("ALLOWED_HOSTS")
CSRF_TRUSTED_ORIGINS = _required_env_list("CSRF_TRUSTED_ORIGINS")
CORS_ALLOWED_ORIGINS = _required_env_list("CORS_ALLOWED_ORIGINS")

# Apache gère le HTTPS — on lui fait confiance via X-Forwarded-Proto
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_X_FORWARDED_HOST = True

# HTTPS / HSTS — la redirection HTTP→HTTPS est gérée par Caddy au niveau du domaine public.
# Activer SECURE_SSL_REDIRECT ici casserait le trafic interne Docker (frontend→backend en HTTP)
# car Django ne reçoit pas X-Forwarded-Proto sur les appels inter-services.
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

# Cookies durcis (HttpOnly est l'option Django par défaut sur sessions)
SESSION_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SECURE = True
CSRF_COOKIE_HTTPONLY = True
CSRF_COOKIE_SAMESITE = "Lax"

# Headers de sécurité Django
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"

STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

# WhiteNoise doit être juste après SecurityMiddleware
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "json": {
            "format": '{"time":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","message":"%(message)s"}',
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "json",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
    "loggers": {
        "django.security": {
            "handlers": ["console"],
            "level": "ERROR",
            "propagate": False,
        },
    },
}
