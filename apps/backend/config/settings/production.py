from django.core.exceptions import ImproperlyConfigured

from .base import *

DEBUG = False

EMAIL_BACKEND = os.environ.get(
    "EMAIL_BACKEND", "django.core.mail.backends.smtp.EmailBackend"
)


# Chaque contrôle lève ImproperlyConfigured : un conteneur mal configuré ne
# démarre pas (deploy/deploy.sh échoue dès la migration).
def _required_env(name: str, hint: str = "") -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise ImproperlyConfigured(
            f"Variable d'environnement {name!r} obligatoire en production. {hint}"
            "Modèle : deploy/env/production.env.example."
        )
    return value


def _required_env_list(name: str) -> list[str]:
    raw = _required_env(name, "Liste séparée par des virgules. ")
    values = [v.strip() for v in raw.split(",") if v.strip()]
    if not values:
        raise ImproperlyConfigured(f"{name!r} ne peut pas être vide en production.")
    return values


SECRET_KEY = _required_env("SECRET_KEY")
if len(SECRET_KEY) < 50 or SECRET_KEY == "change-me-in-production":
    raise ImproperlyConfigured(
        "SECRET_KEY doit faire au moins 50 caractères et ne pas reprendre la "
        "valeur par défaut."
    )

# Domaines publics, plus « backend » (appels du proxy Next.js sur le réseau
# Docker) et « localhost » (requêtes locales sur le serveur, par le port publié
# sur 127.0.0.1). L'admin par Tailscale Serve arrive avec le nom MagicDNS du
# serveur, à inscrire dans DJANGO_ALLOWED_HOSTS
# (docs/exploitation/acces-admin-django.md).
ALLOWED_HOSTS = [*_required_env_list("DJANGO_ALLOWED_HOSTS"), "backend", "localhost"]
CSRF_TRUSTED_ORIGINS = _required_env_list("CSRF_TRUSTED_ORIGINS")
CORS_ALLOWED_ORIGINS = _required_env_list("CORS_ALLOWED_ORIGINS")

# Liens des e-mails (confirmation, réinitialisation) : jamais localhost en production.
FRONTEND_URL = _required_env("FRONTEND_URL")
DATABASES["default"]["PASSWORD"] = _required_env("POSTGRES_PASSWORD")
CELERY_BROKER_URL = CELERY_RESULT_BACKEND = _required_env(
    "REDIS_URL", "Avec mot de passe : redis://:<mot de passe>@redis:6379/0. "
)
# Workers Celery : les logs passent par LOGGING ci-dessous, pas par celui de Celery.
CELERY_WORKER_HIJACK_ROOT_LOGGER = False

# Stockage OVH : aucune valeur par défaut en production, sinon les fichiers
# partiraient sans prévenir dans un autre bucket. Chaque environnement a le sien.
_STORAGE_HINT = "Stockage OVH : un bucket propre à chaque environnement. "
AWS_STORAGE_BUCKET_NAME = _required_env("OVH_S3_BUCKET_PRIVATE", _STORAGE_HINT)
AWS_S3_ENDPOINT_URL = _required_env("OVH_S3_ENDPOINT_URL", _STORAGE_HINT)
AWS_ACCESS_KEY_ID = _required_env("OVH_S3_ACCESS_KEY", _STORAGE_HINT)
AWS_SECRET_ACCESS_KEY = _required_env("OVH_S3_SECRET_KEY", _STORAGE_HINT)

# Caddy termine le HTTPS (deploy/edge/Caddyfile) et transmet X-Forwarded-Proto.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_X_FORWARDED_HOST = True

# HTTPS / HSTS : Caddy redirige HTTP vers HTTPS. SECURE_SSL_REDIRECT casserait
# le trafic interne Docker (frontend → backend en HTTP, sans X-Forwarded-Proto).
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

# Liste de base (santé en tête, axes en fin) avec WhiteNoise juste après
# SecurityMiddleware.
MIDDLEWARE = [*MIDDLEWARE]
MIDDLEWARE.insert(
    MIDDLEWARE.index("django.middleware.security.SecurityMiddleware") + 1,
    "whitenoise.middleware.WhiteNoiseMiddleware",
)

# Logs JSON sur la sortie standard (rotation par Docker), masqués par
# apps/core/json_logging.py. Le succès d'une tâche Celery (avec sa valeur de
# retour) n'est pas journalisé : seuls ses échecs le sont.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "json": {"()": "apps.core.json_logging.JsonFormatter"},
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "stream": "ext://sys.stdout",
            "formatter": "json",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": os.environ.get("DJANGO_LOG_LEVEL", "INFO"),
    },
    "loggers": {
        "django.security": {
            "handlers": ["console"],
            "level": "ERROR",
            "propagate": False,
        },
        "celery.app.trace": {"level": "WARNING"},
    },
}
