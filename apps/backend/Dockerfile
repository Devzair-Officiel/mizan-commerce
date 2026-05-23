# ── base ──────────────────────────────────────────────────────────────────────
FROM python:3.12-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y libpq-dev gcc && rm -rf /var/lib/apt/lists/*

# ── development ───────────────────────────────────────────────────────────────
FROM base AS development
COPY requirements/ requirements/
RUN pip install --no-cache-dir -r requirements/local.txt
COPY . .
EXPOSE 8000
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]

# ── production ────────────────────────────────────────────────────────────────
FROM base AS production
COPY requirements/ requirements/
RUN pip install --no-cache-dir -r requirements/production.txt
COPY . .
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
EXPOSE 8000
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["gunicorn", "--config", "gunicorn.conf.py", "config.wsgi:application"]
