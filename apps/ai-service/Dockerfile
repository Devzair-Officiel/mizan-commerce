# ── base : dépendances système et Python ──────────────────────────────────────
FROM python:3.12-slim AS base
WORKDIR /app

# Dépendances système strictement nécessaires à PaddlePaddle + PaddleOCR CPU :
#   - libgomp1                  : runtime OpenMP requis par Paddle
#   - libglib2.0-0 / libgl1     : dépendances d'`opencv-contrib-python`
#     (PaddleOCR n'utilise pas la variante `-headless`, on doit fournir libGL)
#   - libsm6 / libxext6 /
#     libxrender1               : liaisons X11 attendues par opencv même sans
#                                 affichage — moins d'erreurs runtime obscures
# --no-install-recommends + nettoyage apt lists : image la plus fine possible.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libgomp1 \
        libglib2.0-0 \
        libgl1 \
        libsm6 \
        libxext6 \
        libxrender1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 8000

# ── development (docker-compose.yml : code monté, rechargement à chaud) ───────
FROM base AS development
COPY . .
# Cache des modèles PaddleOCR. Un volume Docker (docker-compose.yml) monte ce
# chemin pour éviter de retélécharger les modèles à chaque rebuild.
ENV PADDLE_PDX_CACHE_HOME=/root/.paddlex
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# ── production (deploy/app/compose.yml) ───────────────────────────────────────
# Utilisateur non root : seul le cache des modèles lui appartient (volume nommé,
# initialisé avec ces droits au premier montage). Les modèles se téléchargent
# au premier appel OCR.
FROM base AS production
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOME=/home/app \
    PADDLE_PDX_CACHE_HOME=/home/app/.paddlex
RUN groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid app --create-home --home-dir /home/app \
        --shell /usr/sbin/nologin app \
    && mkdir -p /home/app/.paddlex \
    && chown app:app /home/app/.paddlex
COPY . .
USER app
# Un seul processus : le pipeline OCR occupe ~1 Go en mémoire par processus.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
