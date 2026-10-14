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
