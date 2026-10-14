#!/usr/bin/env bash
# Restaure la base d'un environnement depuis le bucket de sauvegardes, dans un
# NOUVEAU volume et un conteneur séparé. La base en service n'est jamais touchée.
#
#   deploy/backup/restore.sh <production|staging>
#       dernière sauvegarde, puis tout le journal archivé (état le plus récent)
#   deploy/backup/restore.sh <production|staging> --time "2026-10-14 09:30:00+02:00"
#       état à cet instant (fuseau obligatoire, ou Z pour UTC)
#
# Résultat : volume mizan-<env>-pgrestore-<date>, servi par le conteneur
# mizan-<env>-restore (sans port ni réseau public), pour vérifier les données
# ou les mettre en service. Suite : docs/exploitation/sauvegardes.md.
#
# Variable facultative : ENV_FILE=… (défaut : deploy/env/<env>.env)
set -euo pipefail

usage() {
  echo "Usage : $0 <production|staging> [--time \"AAAA-MM-JJ HH:MM:SS+02:00\"]" >&2
  exit 2
}

[[ $# -eq 1 || ($# -eq 3 && $2 == --time) ]] || usage
ENVIRONMENT=$1
TARGET_TIME=${3:-}
[[ $ENVIRONMENT == production || $ENVIRONMENT == staging ]] || usage
if [[ -n $TARGET_TIME ]]; then
  [[ $TARGET_TIME =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}[\ T][0-9]{2}:[0-9]{2}(:[0-9]{2})?(Z|[+-][0-9]{2}:[0-9]{2})$ ]] \
    || { echo "Instant invalide : $TARGET_TIME (AAAA-MM-JJ HH:MM:SS+02:00)" >&2; exit 2; }
fi

DEPLOY_DIR=$(cd "$(dirname "$0")/.." && pwd)
ENV_FILE=$(realpath "${ENV_FILE:-$DEPLOY_DIR/env/$ENVIRONMENT.env}")
[[ -f $ENV_FILE ]] || { echo "Fichier de variables absent : $ENV_FILE" >&2; exit 1; }
grep -qx "APP_ENV=$ENVIRONMENT" "$ENV_FILE" \
  || { echo "$ENV_FILE ne contient pas APP_ENV=$ENVIRONMENT" >&2; exit 1; }

PROJECT=mizan-$ENVIRONMENT
VOLUME=$PROJECT-pgrestore-$(date -u +%Y%m%d-%H%M%S)
CONTAINER=$PROJECT-restore
RECOVERY_TIMEOUT_MINUTES=120

# Seule l'image PostgreSQL sert ici ; l'étiquette des images applicatives n'est
# demandée que par l'analyse du fichier compose.
export IMAGE_TAG=${IMAGE_TAG:-restore}
compose() {
  docker compose --project-name "$PROJECT" --env-file "$ENV_FILE" \
    --file "$DEPLOY_DIR/app/compose.yml" --profile restore "$@"
}
log() { echo "==> [$ENVIRONMENT] $*"; }
on_error() {
  echo "Restauration interrompue. Volume conservé pour examen : $VOLUME" >&2
  echo "Nettoyage : docker rm -f $CONTAINER; docker volume rm $VOLUME" >&2
}

if docker container inspect "$CONTAINER" >/dev/null 2>&1; then
  echo "Une restauration est déjà servie par $CONTAINER. Après examen :" >&2
  echo "  docker rm -f $CONTAINER   (son volume est conservé)" >&2
  exit 1
fi

compose config --quiet
trap on_error ERR

# Étiquettes Compose : le volume pourra remplacer postgres-data (POSTGRES_DATA_VOLUME).
log "Nouveau volume $VOLUME"
docker volume create --label "com.docker.compose.project=$PROJECT" \
  --label com.docker.compose.volume=postgres-data "$VOLUME" >/dev/null

if [[ -n $TARGET_TIME ]]; then
  log "Récupération de la dernière sauvegarde terminée avant $TARGET_TIME"
else
  log "Récupération de la dernière sauvegarde"
fi
compose run --rm --no-deps --volume "$VOLUME:/var/lib/postgresql/data" \
  restore mizan-backup fetch "$TARGET_TIME"

log "Relecture du journal archivé (jusqu'à ${TARGET_TIME:-son dernier fichier})"
compose run --detach --no-deps --name "$CONTAINER" \
  --volume "$VOLUME:/var/lib/postgresql/data" \
  restore mizan-backup serve "$TARGET_TIME" >/dev/null

restored_psql() { docker exec "$CONTAINER" psql -XAt -v ON_ERROR_STOP=1 "$@"; }

deadline=$(($(date +%s) + RECOVERY_TIMEOUT_MINUTES * 60))
until [[ $(restored_psql -c 'SELECT pg_is_in_recovery()' 2>/dev/null) == f ]]; do
  if [[ $(docker container inspect -f '{{.State.Running}}' "$CONTAINER") != true ]]; then
    docker logs --tail 30 "$CONTAINER" >&2
    echo "La base restaurée s'est arrêtée (instant hors de la période sauvegardée ?)" >&2
    false
  fi
  if (($(date +%s) > deadline)); then
    echo "Relecture non terminée après $RECOVERY_TIMEOUT_MINUTES min : docker logs $CONTAINER" >&2
    false
  fi
  sleep 3
done
trap - ERR

log "Base restaurée"
restored_psql -c "SELECT 'Boutiques : ' || count(*) FROM shops" \
  -c "SELECT 'Dernière commande : ' || coalesce(max(created_at)::text, 'aucune') FROM orders"
cat <<EOF

Volume    : $VOLUME
Conteneur : $CONTAINER (socket local uniquement, aucun archivage)

Examiner :  docker exec -it $CONTAINER psql
Abandonner : docker rm -f $CONTAINER && docker volume rm $VOLUME
Mettre en service : docs/exploitation/sauvegardes.md, « Mettre en service la base restaurée ».
EOF
