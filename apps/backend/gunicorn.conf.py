import os

bind = "0.0.0.0:8000"
# Réglable par environnement (deploy/env/*.env) : 2 × cœurs + 1 au plus, borné par
# la mémoire du conteneur (≈ 150 Mo par worker).
workers = int(os.environ.get("GUNICORN_WORKERS", "3"))
worker_class = "sync"
timeout = 120
keepalive = 5
# Fichier de battement des workers en mémoire, pas sur le disque du conteneur.
worker_tmp_dir = "/dev/shm"
accesslog = "-"
errorlog = "-"
loglevel = "info"
# Ligne d'accès sans IP, sans paramètres d'URL ni user-agent : méthode, chemin,
# statut, taille, durée (ms). Format JSON commun avec Django :
# apps/core/json_logging.py.
access_log_format = "%(m)s %(U)s %(s)s %(B)s %(M)sms"
logconfig_dict = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"json": {"()": "apps.core.json_logging.JsonFormatter"}},
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "stream": "ext://sys.stdout",
            "formatter": "json",
        },
    },
    "loggers": {
        name: {"handlers": ["console"], "level": "INFO", "propagate": False}
        for name in ("gunicorn.error", "gunicorn.access")
    },
}
