#!/usr/bin/env bash
# Test complet des sauvegardes sur la machine locale, avec MinIO à la place du
# bucket OVH (deploy/backup/compose.test.yml) : aucun appel aux vrais buckets.
#
#   deploy/backup/test-local.sh
#
# Scénario, sur un environnement « staging » éphémère :
#   1. boutique A, première sauvegarde complète (lancée par le planificateur) ;
#   2. boutique B, instant T noté, boutique C, archivage du journal attendu ;
#   3. panne simulée : volume de la base supprimé ;
#   4. restauration à l'instant T (deploy/backup/restore.sh) : A et B, pas C ;
#   5. mise en service de la base restaurée, nouvelle sauvegarde ;
#   6. test de restauration mensuel : succès ; clé de chiffrement fausse : échec.
# Tout est arrêté et supprimé à la fin, y compris en cas d'échec.
#
# Prérequis : Docker. Construit l'image backend de production si elle manque
# (plusieurs minutes). Refuse de démarrer si un projet mizan-staging existe déjà.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
PROJECT=mizan-staging
TAG=backup-test
BACKEND_IMAGE=ghcr.io/devzair-officiel/mizan-backend:$TAG
WORK=$(mktemp -d)
ENV_FILE=$WORK/staging.env
CREATED_NETWORK=0
BUILT_BACKEND=0

log() { echo; echo "==> $*"; }
fail() {
  echo "ÉCHEC : $*" >&2
  exit 1
}
compose() {
  docker compose --project-name "$PROJECT" --env-file "$ENV_FILE" \
    --file "$ROOT/deploy/app/compose.yml" --file "$ROOT/deploy/backup/compose.test.yml" \
    --profile backup-test "$@"
}
psql_live() { compose exec -T postgres psql -XAt -U mizan -d mizan_staging -c "$1"; }
psql_restored() { docker exec "$PROJECT-restore" psql -XAt -c "$1"; }
shop_names() { echo "SELECT string_agg(name, ',' ORDER BY name) FROM shops"; }

cleanup() {
  local status=$?
  log "Nettoyage"
  docker rm -f "$PROJECT-restore" >/dev/null 2>&1 || true
  compose --profile restore down --remove-orphans --timeout 10 || true
  docker volume ls -q --filter "label=com.docker.compose.project=$PROJECT" \
    | xargs -r docker volume rm >/dev/null || true
  if [[ $CREATED_NETWORK == 1 ]]; then docker network rm edge >/dev/null || true; fi
  if [[ $BUILT_BACKEND == 1 ]]; then docker image rm "$BACKEND_IMAGE" >/dev/null || true; fi
  docker image rm mizan-postgres:16 >/dev/null 2>&1 || true
  rm -f "$ENV_FILE"
  rmdir "$WORK"
  if [[ $status -eq 0 ]]; then echo "Test réussi."; else echo "Test en échec ($status)." >&2; fi
}

# Le test supprime le volume de la base : jamais sur un environnement existant.
if [[ -n $(docker ps -aq --filter "label=com.docker.compose.project=$PROJECT") ||
  -n $(docker volume ls -q --filter "label=com.docker.compose.project=$PROJECT") ]]; then
  rmdir "$WORK"
  fail "un projet $PROJECT existe déjà sur cette machine : test annulé"
fi
trap cleanup EXIT

set_var() {
  sed -i "/^$1=/d" "$ENV_FILE"
  printf '%s=%s\n' "$1" "$2" >>"$ENV_FILE"
}

write_env_file() {
  local today
  today=$(date -u +%-d)
  cp "$ROOT/deploy/env/staging.env.example" "$ENV_FILE"
  set_var SECRET_KEY "$(openssl rand -hex 32)"
  set_var POSTGRES_PASSWORD "$(openssl rand -hex 16)"
  set_var REDIS_PASSWORD "$(openssl rand -hex 16)"
  set_var EMAIL_HOST localhost
  set_var OVH_S3_ACCESS_KEY test
  set_var OVH_S3_SECRET_KEY test
  set_var AI_SERVICE_API_KEY "$(openssl rand -hex 16)"
  set_var BACKUP_S3_ENDPOINT_URL http://minio:9000
  set_var BACKUP_S3_REGION us-east-1
  set_var BACKUP_S3_BUCKET mizan-backups-test
  set_var BACKUP_S3_ACCESS_KEY mizan-test
  set_var BACKUP_S3_SECRET_KEY "$(openssl rand -hex 16)"
  set_var BACKUP_ENCRYPTION_KEY "$(openssl rand -hex 32)"
  set_var BACKUP_HEARTBEAT_URL http://heartbeat:8080/backup
  set_var ARCHIVE_HEARTBEAT_URL http://heartbeat:8080/archive
  set_var RESTORE_TEST_HEARTBEAT_URL http://heartbeat:8080/restore
  # Le test mensuel est lancé à la main : jamais aujourd'hui par le planificateur.
  set_var RESTORE_TEST_DAY $((today % 28 + 1))
}

add_shop() {
  compose run --rm --no-deps -T backend python manage.py shell -c "
from apps.orders.models import Order
from apps.shops.models import Shop
shop = Shop.objects.create(name='$1')
Order.objects.create(shop=shop, order_number='$1-1')"
  echo "Boutique $1 et sa commande créées"
}

# Attend qu'un motif apparaisse dans les signaux reçus par la surveillance factice.
wait_signal() {
  local pattern=$1
  for _ in $(seq 1 60); do
    compose logs --no-log-prefix heartbeat | grep -q -- "$pattern" && return 0
    sleep 5
  done
  fail "signal « $pattern » non reçu"
}

# Attend que le segment du journal qui contient la dernière écriture soit archivé
# (archive_timeout : 60 s au plus, sans forcer de changement de segment).
wait_archived() {
  local wal
  wal=$(psql_live "SELECT pg_walfile_name(pg_current_wal_lsn())")
  echo "Attente de l'archivage de $wal (archive_timeout)"
  for _ in $(seq 1 40); do
    [[ $(psql_live "SELECT coalesce(last_archived_wal, '') >= '$wal' FROM pg_stat_archiver") == t ]] \
      && return 0
    sleep 5
  done
  fail "segment $wal non archivé après 200 s"
}

prepare() {
  log "Préparation : variables de test, images, MinIO"
  write_env_file
  export IMAGE_TAG=$TAG
  if ! docker network inspect edge >/dev/null 2>&1; then
    docker network create edge >/dev/null
    CREATED_NETWORK=1
  fi
  if ! docker image inspect "$BACKEND_IMAGE" >/dev/null 2>&1; then
    docker build --quiet --target production -t "$BACKEND_IMAGE" "$ROOT/apps/backend" >/dev/null
    BUILT_BACKEND=1
  fi
  compose build --quiet postgres
  compose up --detach --wait postgres heartbeat
  compose run --rm --no-deps -T backend python manage.py migrate --noinput >/dev/null
}

scenario_backup() {
  log "1. Boutique A, première sauvegarde complète par le planificateur"
  add_shop A
  compose up --detach --wait backup
  wait_signal "SIGNAL /backup |"
  compose run --rm --no-deps -T minio-init ls "test/mizan-backups-test/" | grep -q "staging/" \
    || fail "préfixe staging/ absent du bucket"

  log "2. Boutique B, instant T, boutique C"
  add_shop B
  sleep 2
  TARGET_TIME=$(date -u '+%F %T+00:00')
  echo "Instant T : $TARGET_TIME"
  sleep 2
  add_shop C
  wait_archived
  compose exec -T backup mizan-backup check-archive
}

scenario_restore() {
  log "3. Panne simulée : suppression du volume de la base"
  compose rm --stop --force postgres backup
  docker volume rm "${PROJECT}_postgres-data" >/dev/null

  log "4. Restauration à l'instant T"
  ENV_FILE=$ENV_FILE "$ROOT/deploy/backup/restore.sh" staging --time "$TARGET_TIME"
  [[ $(psql_restored "$(shop_names)") == A,B ]] \
    || fail "boutiques restaurées : $(psql_restored "$(shop_names)") (attendu : A,B)"
  echo "Boutiques A et B présentes, C absente"
  [[ $(psql_restored "SELECT count(*) FROM orders") == 2 ]] || fail "commandes restaurées ≠ 2"

  log "5. Mise en service de la base restaurée"
  RESTORED_VOLUME=$(docker volume ls -q --filter "name=$PROJECT-pgrestore-")
  docker stop "$PROJECT-restore" >/dev/null
  docker rm "$PROJECT-restore" >/dev/null
  set_var POSTGRES_DATA_VOLUME "$RESTORED_VOLUME"
  compose up --detach --wait postgres backup
  [[ $(psql_live "$(shop_names)") == A,B ]] || fail "base en service : $(psql_live "$(shop_names)")"
  compose exec -T backup mizan-backup backup
  add_shop D
  wait_archived
}

scenario_restore_test() {
  local output
  log "6. Test de restauration mensuel"
  output=$(compose exec -T backup mizan-backup restore-test) || fail "test de restauration en échec"
  echo "$output"
  grep -q "Boutiques : 3 restaurées, 3 en service" <<<"$output" || fail "chiffres inattendus"

  log "Clé de chiffrement fausse : sauvegarde illisible, échec signalé"
  if timeout 300 docker compose --project-name "$PROJECT" --env-file "$ENV_FILE" \
    --file "$ROOT/deploy/app/compose.yml" exec -T \
    -e "WALG_LIBSODIUM_KEY=$(openssl rand -hex 32)" \
    -e RESTORE_TEST_HEARTBEAT_URL=http://heartbeat:8080/cle-fausse \
    backup mizan-backup restore-test; then
    fail "sauvegarde lue avec une autre clé"
  fi
  wait_signal "SIGNAL /cle-fausse/fail |"

  log "Signaux reçus par la surveillance"
  compose logs --no-log-prefix heartbeat | grep SIGNAL | sort | uniq -c
  if compose logs --no-log-prefix heartbeat | grep -v /cle-fausse/ | grep -q "/fail"; then
    fail "signal d'échec reçu"
  fi
  wait_signal "SIGNAL /restore |"
}

prepare
scenario_backup
scenario_restore
scenario_restore_test
