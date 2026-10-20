#!/usr/bin/env bash
# Garde-fou mémoire des phases lourdes (build, pytest complet, audits Playwright), depuis n'importe où.
# Lecture de /proc, de la pression de la session et de `docker stats` : aucun réglage système modifié.
#
#   infra/scripts/mem-check.sh                 état actuel, ne bloque rien (les commandes légères restent libres)
#                                              code 0 : rien à signaler ; 1 : pression mémoire ;
#                                              2 : une phase lourde tourne déjà (audits, build, pytest)
#   infra/scripts/mem-check.sh run <commande>  lance une phase lourde si l'état est 0, relève la mémoire
#                                              toutes les MEM_INTERVAL secondes, affiche les pics à la fin
#
# Seuils, sous ceux de systemd-oomd (session fermée au-delà de 50 % de pression pendant 30 s) :
#   MEM_MAX_PSI (10)             pression « some avg10 » de la session, en %
#   MEM_MIN_AVAILABLE_MB (2048)  mémoire disponible
#   MEM_MAX_SWAP_PCT (70)        swap occupé
# MEM_FORCE=1 lance malgré une pression mémoire, uniquement après accord explicite. Il ne permet jamais
# deux phases lourdes à la fois : verrou et détection ne se contournent pas.
# Journal horodaté (chiffres et noms de conteneurs seulement, jamais la commande) : MEM_LOG,
# ~/.local/state/mizan-commerce/mem.log par défaut ; MEM_LABEL nomme la phase (« audits smoke »…).
set -u
cd "$(dirname "$0")/../.." || exit 1

MAX_PSI=${MEM_MAX_PSI:-10}
MIN_AVAILABLE=${MEM_MIN_AVAILABLE_MB:-2048}
MAX_SWAP=${MEM_MAX_SWAP_PCT:-70}
INTERVAL=${MEM_INTERVAL:-15}
LOG=${MEM_LOG:-${XDG_STATE_HOME:-$HOME/.local/state}/mizan-commerce/mem.log}
LOCK=${XDG_RUNTIME_DIR:-/tmp}/mizan-commerce-heavy.lock
PROJECT=mizan-commerce
# Pression vue par systemd-oomd pour la session ; à défaut, celle de la machine.
SESSION_PSI=/sys/fs/cgroup/user.slice/user-$(id -u).slice/user@$(id -u).service/memory.pressure
[ -r "$SESSION_PSI" ] || SESSION_PSI=/proc/pressure/memory

meminfo_mb() { awk -v k="$1:" '$1 == k { print int($2 / 1024) }' /proc/meminfo; }
psi() { awk '$1 == "some" { split($2, a, "="); print a[2] }' "$1"; }
swap_pct() {
  local total
  total=$(meminfo_mb SwapTotal)
  echo $((total > 0 ? (total - $(meminfo_mb SwapFree)) * 100 / total : 0))
}

# Une ligne horodatée : disponible, swap, pression (session/machine), mémoire des conteneurs du projet.
sample() {
  local ids containers=""
  ids=$(docker ps -q --filter "label=com.docker.compose.project=$PROJECT")
  # shellcheck disable=SC2086  # une liste d'identifiants
  [ -n "$ids" ] && containers=$(docker stats --no-stream --format '{{.Name}}={{.MemUsage}}' $ids 2>/dev/null \
    | sed -E "s/^$PROJECT-//; s/-1=/=/; s/ \/ .*//" | sort | tr '\n' ' ')
  echo "$(date '+%F %T') dispo=$(meminfo_mb MemAvailable)Mo swap=$(swap_pct)% psi=$(psi "$SESSION_PSI")/$(psi /proc/pressure/memory) $containers"
}

# Phases lourdes en cours, vues depuis l'hôte (aucun outil requis dans les images).
heavy() {
  local found=()
  flock -n "$LOCK" true 2>/dev/null || found+=(mem-check-run)
  [ -n "$(docker ps -q --filter "label=com.docker.compose.project=$PROJECT" \
    --filter label=com.docker.compose.service=e2e)" ] && found+=(audits)
  docker compose top frontend 2>/dev/null | grep -q 'next build' && found+=(build)
  docker compose top backend 2>/dev/null | grep -q 'pytest' && found+=(pytest)
  echo "${found[*]}"
}

check() {
  local running
  sample
  running=$(heavy)
  if [ -n "$running" ]; then echo "⚠ Phase lourde déjà en cours : $running"; return 2; fi
  if [ "$(meminfo_mb MemAvailable)" -lt "$MIN_AVAILABLE" ] || [ "$(swap_pct)" -gt "$MAX_SWAP" ] \
    || awk -v p="$(psi "$SESSION_PSI")" -v m="$MAX_PSI" 'BEGIN { exit !(p > m) }'; then
    echo "⚠ Pression mémoire (seuils : dispo ≥ ${MIN_AVAILABLE}Mo, swap ≤ ${MAX_SWAP}%, psi ≤ ${MAX_PSI})"
    return 1
  fi
}

run() {
  local code sampler first
  [ $# -gt 0 ] || { echo "Usage : $0 run <commande>" >&2; exit 64; }
  check; code=$?
  if [ "$code" -eq 2 ] || { [ "$code" -eq 1 ] && [ "${MEM_FORCE:-0}" != 1 ]; }; then
    echo "Phase lourde non lancée.$([ "$code" -eq 1 ] && echo ' MEM_FORCE=1 pour passer outre, après accord.')" >&2
    exit "$code"
  fi
  exec 9>"$LOCK"
  flock -n 9 || { echo "⚠ Une autre phase lourde vient de démarrer : non lancée." >&2; exit 2; }
  mkdir -p "$(dirname "$LOG")"
  [ -f "$LOG" ] && [ "$(stat -c %s "$LOG")" -gt 2000000 ] && mv "$LOG" "$LOG.1"
  first=$(($([ -f "$LOG" ] && wc -l <"$LOG" || echo 0) + 2))
  echo "=== $(date '+%F %T') début : ${MEM_LABEL:-phase lourde}$([ "$code" -eq 1 ] && echo ' (MEM_FORCE)')" >>"$LOG"
  # Relevés sans le verrou (9>&-) ; s'arrêtent avec ce script, même tué par SIGKILL (trap EXIT sauté).
  (while kill -0 $$ 2>/dev/null; do sample >>"$LOG"; sleep "$INTERVAL"; done) 9>&- &
  sampler=$!
  trap 'kill "$sampler" 2>/dev/null' EXIT
  "$@"; code=$?
  kill "$sampler" 2>/dev/null
  sample >>"$LOG"
  echo "=== $(date '+%F %T') fin : code $code" >>"$LOG"
  echo "--- Mémoire pendant la phase ($LOG)"
  tail -n +"$first" "$LOG" | awk '
    /^===/ { next }
    { n++; match($0, /dispo=[0-9]+/); a = substr($0, RSTART + 6, RLENGTH - 6) + 0
      match($0, /swap=[0-9]+/); s = substr($0, RSTART + 5, RLENGTH - 5) + 0
      match($0, /psi=[0-9.]+/); p = substr($0, RSTART + 4, RLENGTH - 4) + 0
      if (n == 1 || a < amin) amin = a; if (s > smax) smax = s; if (p > pmax) pmax = p }
    END { printf "%d relevés : dispo min %d Mo, swap max %d %%, pression session max %.2f %%\n", n, amin, smax, pmax }'
  heavy | grep -qw audits && echo "⚠ Un conteneur e2e tourne encore après la phase"
  exit "$code"
}

case "${1:-}" in
  run) shift; run "$@" ;;
  "") check ;;
  *) echo "Usage : $0 [run <commande>]" >&2; exit 64 ;;
esac
