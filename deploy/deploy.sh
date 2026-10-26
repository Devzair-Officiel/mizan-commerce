#!/usr/bin/env bash
# Déploie une version de Mizan sur un environnement.
#
#   deploy/deploy.sh <production|staging> <étiquette d'image>
#   deploy/deploy.sh production 3f2c1e…   # identifiant complet du commit (GHCR)
#
# Étapes : récupération des images, rôle PostgreSQL de l'application,
# migrations dans un conteneur ponctuel, redémarrage des services, attente de
# leur santé et de /healthz, puis contrôle que le frontend joint le backend du
# même environnement (réseau edge partagé). S'arrête à la première erreur ; les
# conteneurs en place continuent de servir tant que le redémarrage n'a pas eu
# lieu. Retour à la version précédente : deploy/rollback.sh.
#
# Variables facultatives :
#   ENV_FILE=…   fichier de variables (défaut : deploy/env/<env>.env)
#   NO_PULL=1    images déjà présentes (construites sur la machine, tests locaux)
#   NO_RECORD=1  ne pas inscrire la version dans deploy/state/<env>.tags (rollback.sh)
#
# L'image PostgreSQL (deploy/postgres, avec WAL-G) est construite ici, sur le
# serveur, à partir de l'image officielle à jour.
set -euo pipefail

usage() {
  echo "Usage : $0 <production|staging> <étiquette d'image>" >&2
  exit 2
}

[[ $# -eq 2 ]] || usage
ENVIRONMENT=$1
TAG=$2
[[ $ENVIRONMENT == production || $ENVIRONMENT == staging ]] || usage
[[ $TAG =~ ^[A-Za-z0-9._-]+$ ]] || { echo "Étiquette invalide : $TAG" >&2; exit 2; }

DEPLOY_DIR=$(cd "$(dirname "$0")" && pwd)
ENV_FILE=$(realpath "${ENV_FILE:-$DEPLOY_DIR/env/$ENVIRONMENT.env}")
STATE_FILE=$DEPLOY_DIR/state/$ENVIRONMENT.tags

[[ -f $ENV_FILE ]] || { echo "Fichier de variables absent : $ENV_FILE" >&2; exit 1; }
grep -qx "APP_ENV=$ENVIRONMENT" "$ENV_FILE" \
  || { echo "$ENV_FILE ne contient pas APP_ENV=$ENVIRONMENT" >&2; exit 1; }
docker network inspect edge >/dev/null 2>&1 \
  || { echo "Réseau « edge » absent : docker network create edge" >&2; exit 1; }

export IMAGE_TAG=$TAG
compose() {
  docker compose --project-name "mizan-$ENVIRONMENT" --env-file "$ENV_FILE" \
    --file "$DEPLOY_DIR/app/compose.yml" "$@"
}

log() { echo "==> [$ENVIRONMENT] $*"; }

log "Version $TAG"
compose config --quiet  # variable obligatoire manquante : arrêt avant tout changement

if [[ ${NO_PULL:-0} != 1 ]]; then
  log "Récupération des images"
  compose pull --quiet --ignore-buildable
  log "Image PostgreSQL (WAL-G)"
  compose build --quiet --pull postgres
else
  compose build --quiet postgres
fi

log "Base de données et Redis"
compose up --detach --wait postgres redis

# Rôle de l'application (APP_DB_USER) : créé, ou mot de passe mis à jour depuis
# le fichier de variables, et propriétaire de la base avant les migrations, qui
# tournent avec lui (deploy/postgres/mizan-db-roles.sh).
log "Rôle PostgreSQL de l'application"
if ! compose exec -T postgres mizan-db-roles; then
  echo "Rôle PostgreSQL de l'application non mis en place : déploiement arrêté avant les migrations." >&2
  echo "Les conteneurs en place continuent de servir. Détails ci-dessus ;" \
    "docs/exploitation/deploiement.md, « Comptes PostgreSQL »." >&2
  exit 1
fi

# Migrations avec la nouvelle image, avant le redémarrage : elles doivent rester
# compatibles avec la version encore en service (docs/exploitation/deploiement.md).
log "Migrations"
compose run --rm --no-deps backend python manage.py migrate --noinput

log "Redémarrage des services"
compose up --detach --remove-orphans --wait --wait-timeout 300

log "Attente de /healthz"
for attempt in $(seq 1 30); do
  if compose exec -T backend python -c \
    "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=5)" \
    2>/dev/null; then
    break
  fi
  if [[ $attempt -eq 30 ]]; then
    echo "/healthz ne répond pas. Logs : docker compose -p mizan-$ENVIRONMENT logs backend" >&2
    echo "Retour à la version précédente : deploy/rollback.sh $ENVIRONMENT" >&2
    exit 1
  fi
  sleep 2
done

# Le frontend doit joindre SON backend : sur le réseau edge, un nom partagé par
# staging et production se résout en plusieurs adresses (deploy/check-api-url.sh).
log "Résolution d'API_URL depuis le frontend"
if ! ENV_FILE=$ENV_FILE COMPOSE_FILE=$DEPLOY_DIR/app/compose.yml \
  "$DEPLOY_DIR/check-api-url.sh" "$ENVIRONMENT"; then
  echo "Déploiement en échec, version non enregistrée : le frontend peut joindre l'autre" \
    "environnement. Les conteneurs sont laissés tels quels ; corriger API_URL puis redéployer." >&2
  exit 1
fi

if [[ ${NO_RECORD:-0} != 1 ]]; then
  mkdir -p "$(dirname "$STATE_FILE")"
  if [[ ! -f $STATE_FILE || $(tail -n 1 "$STATE_FILE") != "$TAG" ]]; then
    echo "$TAG" >> "$STATE_FILE"
  fi
fi

compose ps --format 'table {{.Service}}\t{{.Status}}'
log "Déployé : $TAG"
