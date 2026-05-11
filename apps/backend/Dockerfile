# Image Python minimale basée sur Debian slim
FROM python:3.12-slim

# Tout le code sera dans /app dans le conteneur
WORKDIR /app

# libpq-dev et gcc sont requis pour compiler psycopg2
RUN apt-get update && apt-get install -y \
    libpq-dev gcc \
    && rm -rf /var/lib/apt/lists/*

# Copie les fichiers requirements avant le reste (cache Docker)
COPY requirements/ requirements/

# Installe les dépendances Python
RUN pip install --no-cache-dir -r requirements/local.txt

# Copie tout le code backend dans le conteneur
COPY . .

# Documente que le conteneur écoute sur le port 8000
EXPOSE 8000
