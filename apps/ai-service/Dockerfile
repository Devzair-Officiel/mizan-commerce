# Image unique — un stage suffit tant que dev et prod partagent la même
# chaîne de dépendances. Passer à un multi-stage si un jour la prod doit
# retirer les outils de build (aucun ici pour l'instant).
FROM python:3.12-slim
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

COPY . .

# Cache des modèles PaddleOCR. Un volume Docker (docker-compose.yml) monte ce
# chemin pour éviter de retélécharger les modèles à chaque rebuild.
ENV PADDLE_PDX_CACHE_HOME=/root/.paddlex

EXPOSE 8000

# `--reload` couvre le dev (le code est monté). En prod, `docker-compose.prod.yml`
# surcharge le `command:` pour retirer `--reload`.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
