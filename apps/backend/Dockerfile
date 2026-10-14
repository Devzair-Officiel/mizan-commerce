# ── development (docker-compose.yml : code monté, runserver) ─────────────────
FROM python:3.12-slim AS development
WORKDIR /app
RUN apt-get update && apt-get install -y libpq-dev gcc && rm -rf /var/lib/apt/lists/*
COPY requirements/ requirements/
RUN pip install --no-cache-dir -r requirements/local.txt
COPY . .
EXPOSE 8000
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]

# ── builder : dépendances de production dans un venv ──────────────────────────
# Toutes ont des wheels (psycopg2-binary embarque libpq) : pas de compilateur.
FROM python:3.12-slim AS builder
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
RUN python -m venv /opt/venv
COPY requirements/ /tmp/requirements/
RUN /opt/venv/bin/pip install -r /tmp/requirements/production.txt

# ── production (deploy/app/compose.yml) ───────────────────────────────────────
# Une image pour gunicorn (CMD par défaut), les workers Celery et Celery Beat
# (autre commande). Les migrations se lancent dans un conteneur ponctuel
# (deploy/deploy.sh), jamais au démarrage.
FROM python:3.12-slim AS production
# Identifiant du commit (CI) : release Sentry par défaut.
ARG RELEASE=""
ENV PATH=/opt/venv/bin:$PATH \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_SETTINGS_MODULE=config.settings.production \
    SENTRY_RELEASE=$RELEASE
WORKDIR /app
RUN groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid app --no-create-home --shell /usr/sbin/nologin app
COPY --from=builder /opt/venv /opt/venv
# Code et fichiers statiques appartiennent à root : l'application ne peut pas les modifier.
COPY . .
# Valeurs factices, le temps de la commande seulement (non conservées dans l'image) :
# production.py exige ces variables, collectstatic n'en utilise aucune.
RUN SECRET_KEY=collectstatic-only-not-a-secret-0123456789-abcdefghijklmnop \
    ALLOWED_HOSTS=build CSRF_TRUSTED_ORIGINS=https://build CORS_ALLOWED_ORIGINS=https://build \
    OVH_S3_BUCKET_PRIVATE=build OVH_S3_ENDPOINT_URL=https://build \
    OVH_S3_ACCESS_KEY=build OVH_S3_SECRET_KEY=build \
    python manage.py collectstatic --noinput
USER app
EXPOSE 8000
CMD ["gunicorn", "--config", "gunicorn.conf.py", "config.wsgi:application"]
