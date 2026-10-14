#!/usr/bin/env bash
# Sauvegardes PostgreSQL de Mizan avec WAL-G (docs/exploitation/sauvegardes.md).
#
#   mizan-backup scheduler        planificateur du service backup (sa commande)
#   mizan-backup backup           sauvegarde complète, puis suppression des anciennes
#   mizan-backup check-archive    contrôle de l'archivage continu du journal
#   mizan-backup restore-test     restaure la dernière sauvegarde dans une instance
#                                 temporaire, vérifie quelques chiffres, supprime tout
#   mizan-backup fetch [instant]  récupère la sauvegarde adéquate dans le répertoire
#                                 de données, vide (service restore, deploy/backup/restore.sh)
#   mizan-backup serve [instant]  démarre la base récupérée, sans archivage
#
# backup, check-archive et restore-test signalent leur résultat au service de
# surveillance (Healthchecks.io ou Better Stack) : l'URL en cas de succès,
# l'URL suivie de /fail en cas d'échec, avec la fin de leur sortie.
#
# Instant : « AAAA-MM-JJ HH:MM:SS+02:00 » (fuseau obligatoire, ou Z pour UTC).
set -euo pipefail

SELF=$(readlink -f "$0")
PGDATA_DIR=/var/lib/postgresql/data
WORK_DIR=/var/lib/mizan-backup
RESTORE_TEST_DIR=$WORK_DIR/restore-test
ALIVE_FILE=/tmp/mizan-backup.alive  # sonde de santé du service backup
ARCHIVE_CHECK_MINUTES=5
RECOVERY_TIMEOUT_MINUTES=120
# Durée maximale d'un appel à WAL-G : un appel bloqué (bucket injoignable, clé
# fausse) ne doit jamais arrêter le planificateur, donc les sauvegardes suivantes.
WALG_TIMEOUT=4h

BACKUP_TIME=${BACKUP_TIME:-02:30}
BACKUP_RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-30}
ARCHIVE_MAX_DELAY_MINUTES=${ARCHIVE_MAX_DELAY_MINUTES:-5}
RESTORE_TEST_DAY=${RESTORE_TEST_DAY:-1}
RESTORE_TEST_TIME=${RESTORE_TEST_TIME:-04:00}

# Chiffres comparés entre la base restaurée et la base en service.
FIGURES_SQL="SELECT (SELECT count(*) FROM shops),
  coalesce((SELECT extract(epoch FROM max(created_at))::bigint FROM orders), 0)"
# Horodatage WAL-G (2026-10-14T02:30:12.123456Z) en secondes.
JQ_EPOCH='def epoch: sub("\\.[0-9]+"; "") | fromdateiso8601;'

log() { echo "$(date -u +%FT%TZ) $*"; }
fail() {
  log "ERREUR : $*" >&2
  exit 1
}

check_settings() {
  [[ ${WALG_LIBSODIUM_KEY:-} =~ ^[0-9a-fA-F]{64}$ ]] \
    || fail "BACKUP_ENCRYPTION_KEY : 64 caractères hexadécimaux attendus (openssl rand -hex 32)"
  [[ $BACKUP_TIME =~ ^([01][0-9]|2[0-3]):[0-5][0-9]$ ]] || fail "BACKUP_TIME : HH:MM attendu"
  [[ $RESTORE_TEST_TIME =~ ^([01][0-9]|2[0-3]):[0-5][0-9]$ ]] || fail "RESTORE_TEST_TIME : HH:MM attendu"
  [[ $BACKUP_RETENTION_DAYS =~ ^[1-9][0-9]*$ ]] || fail "BACKUP_RETENTION_DAYS : nombre de jours attendu"
  [[ $ARCHIVE_MAX_DELAY_MINUTES =~ ^[1-9][0-9]*$ ]] || fail "ARCHIVE_MAX_DELAY_MINUTES : nombre attendu"
  [[ $RESTORE_TEST_DAY =~ ^([1-9]|1[0-9]|2[0-8])$ ]] || fail "RESTORE_TEST_DAY : de 1 à 28"
}

check_target() {
  [[ $1 =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}[\ T][0-9]{2}:[0-9]{2}(:[0-9]{2})?(Z|[+-][0-9]{2}:[0-9]{2})$ ]] \
    || fail "instant invalide : « $1 » (AAAA-MM-JJ HH:MM:SS+02:00)"
  date -u -d "$1" +%s >/dev/null 2>&1 || fail "instant invalide : « $1 »"
}

# WAL-G, arrêté de force s'il dépasse WALG_TIMEOUT (il ignore parfois SIGTERM).
walg() { timeout --kill-after=1m "$WALG_TIMEOUT" wal-g "$@"; }

# Envoie un signal au service de surveillance. Sans URL, rien n'est envoyé ;
# une surveillance injoignable ne fait pas échouer la tâche.
signal() {
  local url=$1 body=$2
  [[ -n $url ]] || return 0
  curl -fsS -m 10 --retry 3 -o /dev/null --data-raw "$body" "$url" \
    || log "Signal non transmis au service de surveillance"
}

# Lance une tâche dans un processus séparé (set -e y reste actif), puis signale
# son résultat avec la fin de sa sortie. Les URL ne sont jamais écrites dans les logs.
run_job() {
  local job=$1 ok_url=$2 fail_url=$3 out status=0
  out=$(mktemp)
  "$SELF" "_$job" 2>&1 | tee "$out" || status=$?
  if [[ $status -eq 0 ]]; then
    signal "$ok_url" "$(tail -n 30 "$out")"
  else
    signal "${fail_url:+$fail_url/fail}" "$(tail -n 30 "$out")"
  fi
  rm -f "$out"
  return "$status"
}

backups_json() {
  local json
  json=$(walg backup-list --detail --json)
  if [[ -z $json || $json == null ]]; then echo '[]'; else echo "$json"; fi
}

# Garde la sauvegarde complète la plus récente terminée avant la limite, et
# toutes les suivantes : retour possible à tout instant des N derniers jours.
apply_retention() {
  local cutoff target
  cutoff=$(date -u -d "-$BACKUP_RETENTION_DAYS days" +%s)
  target=$(backups_json | jq -r --argjson cutoff "$cutoff" "$JQ_EPOCH"'
    [.[] | select((.finish_time | epoch) <= $cutoff)]
    | sort_by(.finish_time) | last | .backup_name // empty')
  if [[ -z $target ]]; then
    log "Conservation ($BACKUP_RETENTION_DAYS jours) : rien à supprimer"
    return
  fi
  log "Conservation ($BACKUP_RETENTION_DAYS jours) : suppression de ce qui précède $target"
  walg delete before FIND_FULL "$target" --confirm
}

job_backup() {
  check_settings
  log "Sauvegarde complète de la base"
  walg backup-push "$PGDATA_DIR"
  apply_retention
  backups_json | jq -r 'sort_by(.finish_time)
    | "Sauvegardes conservées : \(length), de \(first.finish_time) à \(last.finish_time)",
      "Dernière : \(last.backup_name), \(last.compressed_size) octets compressés"'
}

job_check_archive() {
  local row mode archived failed last_wal last_age failing pending oldest state
  row=$(psql -XAt -F '|' -v ON_ERROR_STOP=1 <<'SQL'
SELECT current_setting('archive_mode'), a.archived_count, a.failed_count,
       coalesce(a.last_archived_wal, 'aucun'),
       coalesce(extract(epoch FROM now() - a.last_archived_time)::bigint, -1),
       coalesce(a.last_failed_time > coalesce(a.last_archived_time, '-infinity'), false),
       r.pending, coalesce(extract(epoch FROM now() - r.oldest)::bigint, 0)
FROM pg_stat_archiver a,
     (SELECT count(*) AS pending, min(modification) AS oldest
      FROM pg_ls_archive_statusdir() WHERE name LIKE '%.ready') r
SQL
  )
  IFS='|' read -r mode archived failed last_wal last_age failing pending oldest <<<"$row"
  state="archivés : $archived, échecs : $failed, dernier : $last_wal"
  ((last_age < 0)) || state+=" (il y a $last_age s)"
  [[ $failing == f ]] || state+=", dernier essai en échec"
  [[ $mode == on ]] || fail "archivage désactivé (archive_mode=$mode)"
  # Un fichier « .ready » attend son archivage ; sur une base calme, l'ancienneté
  # du dernier fichier archivé ne dit rien, celle du plus ancien en attente si.
  if ((pending > 0 && oldest > ARCHIVE_MAX_DELAY_MINUTES * 60)); then
    fail "archivage en retard : $pending fichier(s) en attente depuis $oldest s ; $state"
  fi
  log "Archivage à jour, $pending en attente ; $state"
}

fmt_epoch() {
  if [[ $1 == 0 ]]; then echo "aucune"; else date -u -d "@$1" '+%F %T UTC'; fi
}

stop_restore_test() {
  local status=$?
  if [[ -f $RESTORE_TEST_DIR/data/postmaster.pid ]]; then
    pg_ctl -D "$RESTORE_TEST_DIR/data" -m fast -w stop >/dev/null || true
  fi
  if [[ $status -ne 0 && -f $RESTORE_TEST_DIR/postgres.log ]]; then
    tail -n 20 "$RESTORE_TEST_DIR/postgres.log"
  fi
  rm -rf -- "${RESTORE_TEST_DIR:?}"
  log "Instance temporaire arrêtée, fichiers supprimés"
}

job_restore_test() {
  local data=$RESTORE_TEST_DIR/data backup deadline restored live
  check_settings
  rm -rf -- "${RESTORE_TEST_DIR:?}"
  install -d -m 700 "$RESTORE_TEST_DIR" "$data"
  trap stop_restore_test EXIT
  backup=$(latest_backup)
  [[ -n $backup ]] || fail "aucune sauvegarde dans le bucket"
  log "Test de restauration : $backup, puis tout le journal archivé"
  check_key "$backup"
  walg backup-fetch "$data" "$backup"
  touch "$data/recovery.signal"
  # Instance temporaire : socket Unix seulement, aucun archivage (le journal de
  # la base en service ne doit jamais être mélangé avec celui d'une copie).
  pg_ctl -D "$data" -l "$RESTORE_TEST_DIR/postgres.log" -W start -o "-c port=5433 \
    -c listen_addresses='' -c unix_socket_directories=$RESTORE_TEST_DIR \
    -c archive_mode=off -c restore_command='wal-g wal-fetch %f %p'"
  deadline=$(($(date +%s) + RECOVERY_TIMEOUT_MINUTES * 60))
  until [[ $(restored_psql -c 'SELECT pg_is_in_recovery()' 2>/dev/null) == f ]]; do
    [[ -f $data/postmaster.pid ]] || fail "l'instance temporaire s'est arrêtée"
    (($(date +%s) < deadline)) || fail "relecture du journal non terminée après $RECOVERY_TIMEOUT_MINUTES min"
    sleep 5
  done
  restored=$(restored_psql -F ' ' -c "$FIGURES_SQL")
  live=$(psql -XAt -F ' ' -v ON_ERROR_STOP=1 -c "$FIGURES_SQL")
  compare_figures "$restored" "$live"
}

restored_psql() { psql -XAt -v ON_ERROR_STOP=1 -h "$RESTORE_TEST_DIR" -p 5433 "$@"; }

compare_figures() {
  local restored_shops restored_last live_shops live_last
  read -r restored_shops restored_last <<<"$1"
  read -r live_shops live_last <<<"$2"
  log "Boutiques : $restored_shops restaurées, $live_shops en service"
  log "Dernière commande : $(fmt_epoch "$restored_last") restaurée, $(fmt_epoch "$live_last") en service"
  ((live_shops == 0 || restored_shops > 0)) || fail "aucune boutique dans la base restaurée"
  # Tout le journal archivé est relu : la copie a au plus quelques minutes de retard.
  ((live_last - restored_last <= 3600)) \
    || fail "dernière commande restaurée plus ancienne d'une heure ou plus"
  log "Test de restauration réussi"
}

latest_backup() {
  backups_json | jq -r 'sort_by(.finish_time) | last | .backup_name // empty'
}

# backup-fetch reste bloqué sur une clé fausse : lecture préalable du premier
# segment de journal de la sauvegarde (base_<segment>), qui échoue franchement.
check_key() {
  local wal=${1#base_} dir status=0
  wal=${wal:0:24}
  dir=$(mktemp -d)
  timeout --kill-after=10s 5m wal-g wal-fetch "$wal" "$dir/$wal" 2>"$dir/err" || status=$?
  if [[ $status -ne 0 ]]; then
    tail -n 3 "$dir/err" >&2
  fi
  rm -f "$dir/$wal" "$dir/err"
  rmdir "$dir"
  ((status == 0)) \
    || fail "journal $wal illisible : clé de chiffrement incorrecte, bucket injoignable ou sauvegarde endommagée"
}

# Sauvegarde complète la plus récente terminée avant l'instant donné.
backup_before() {
  local epoch
  epoch=$(date -u -d "$1" +%s)
  backups_json | jq -r --argjson t "$epoch" "$JQ_EPOCH"'
    [.[] | select((.finish_time | epoch) < $t)] | sort_by(.finish_time) | last
    | .backup_name // empty'
}

job_fetch() {
  local target=${1:-} backup
  check_settings
  [[ -z $(ls -A "$PGDATA_DIR") ]] || fail "$PGDATA_DIR n'est pas vide"
  if [[ -n $target ]]; then
    check_target "$target"
    backup=$(backup_before "$target")
    [[ -n $backup ]] || fail "aucune sauvegarde terminée avant $target"
  else
    backup=$(latest_backup)
    [[ -n $backup ]] || fail "aucune sauvegarde dans le bucket"
  fi
  log "Récupération de la sauvegarde $backup"
  check_key "$backup"
  walg backup-fetch "$PGDATA_DIR" "$backup"
  chmod 700 "$PGDATA_DIR"
  touch "$PGDATA_DIR/recovery.signal"
}

# Relit le journal archivé jusqu'à l'instant (ou jusqu'au dernier fichier),
# puis passe en lecture-écriture. Socket Unix seulement, aucun archivage.
job_serve() {
  local target=${1:-}
  local args=(-c archive_mode=off -c listen_addresses= -c 'restore_command=wal-g wal-fetch %f %p')
  if [[ -n $target ]]; then
    check_target "$target"
    args+=(-c "recovery_target_time=$target" -c recovery_target_action=promote)
  fi
  exec postgres -D "$PGDATA_DIR" "${args[@]}"
}

latest_backup_day() {
  backups_json | jq -r 'sort_by(.finish_time) | last | .finish_time // empty | .[0:10]'
}

restore_test_due() {
  [[ $(date -u +%-d) == "$RESTORE_TEST_DAY" && ! $(date -u +%H:%M) < $RESTORE_TEST_TIME ]] \
    && [[ $(cat "$WORK_DIR/restore-test.month" 2>/dev/null) != "$(date -u +%Y-%m)" ]]
}

# Boucle d'une minute : contrôle de l'archivage toutes les 5 min, sauvegarde
# complète chaque jour à BACKUP_TIME (UTC) ou tout de suite s'il n'y en a aucune,
# nouvel essai une heure après un échec, test de restauration une fois par mois.
job_scheduler() {
  local now today last_backup_day next_check=0 next_backup_try=0
  check_settings
  [[ -n ${BACKUP_HEARTBEAT_URL:-} ]] || log "ATTENTION : BACKUP_HEARTBEAT_URL vide, sauvegardes non surveillées"
  [[ -n ${RESTORE_TEST_HEARTBEAT_URL:-} ]] || log "ATTENTION : RESTORE_TEST_HEARTBEAT_URL vide"
  last_backup_day=$(latest_backup_day) || last_backup_day=
  log "Planificateur : sauvegarde à $BACKUP_TIME UTC, test de restauration le $RESTORE_TEST_DAY à $RESTORE_TEST_TIME UTC"
  while true; do
    touch "$ALIVE_FILE"
    now=$(date -u +%s)
    today=$(date -u +%F)
    if ((now >= next_check)); then
      "$SELF" check-archive || true
      next_check=$((now + ARCHIVE_CHECK_MINUTES * 60))
    fi
    if [[ $last_backup_day != "$today" ]] && ((now >= next_backup_try)) \
      && [[ -z $last_backup_day || ! $(date -u +%H:%M) < $BACKUP_TIME ]]; then
      if "$SELF" backup; then last_backup_day=$today; else next_backup_try=$((now + 3600)); fi
    fi
    if restore_test_due; then
      date -u +%Y-%m >"$WORK_DIR/restore-test.month"
      "$SELF" restore-test || true
    fi
    sleep 60
  done
}

case ${1:-} in
  scheduler) job_scheduler ;;
  backup) run_job backup "${BACKUP_HEARTBEAT_URL:-}" "${BACKUP_HEARTBEAT_URL:-}" ;;
  # Sans URL dédiée, un retard d'archivage est signalé comme échec de sauvegarde.
  check-archive)
    run_job check-archive "${ARCHIVE_HEARTBEAT_URL:-}" \
      "${ARCHIVE_HEARTBEAT_URL:-${BACKUP_HEARTBEAT_URL:-}}"
    ;;
  restore-test)
    run_job restore-test "${RESTORE_TEST_HEARTBEAT_URL:-}" "${RESTORE_TEST_HEARTBEAT_URL:-}"
    ;;
  _backup) job_backup ;;
  _check-archive) job_check_archive ;;
  _restore-test) job_restore_test ;;
  fetch) job_fetch "${2:-}" ;;
  serve) job_serve "${2:-}" ;;
  *)
    sed -n '3,12p' "$SELF" >&2
    exit 2
    ;;
esac
