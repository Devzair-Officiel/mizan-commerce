# Image unique — pas besoin de multi-stage tant que le service reste sans
# dépendance ML native. On passera à un stage `production` distinct dès
# qu'on ajoutera Paddle/Tesseract/CUDA pour ne pas les traîner en dev.
FROM python:3.12-slim
WORKDIR /app

COPY requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# `--reload` couvre le dev (le code est monté). En prod, `docker-compose.prod.yml`
# surcharge le `command:` pour retirer `--reload`.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
