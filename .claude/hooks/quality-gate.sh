#!/usr/bin/env bash
# Lancer à la main depuis la racine du projet (conteneurs démarrés) :
#   echo '{}' | CLAUDE_PROJECT_DIR="$(pwd)" bash .claude/hooks/quality-gate.sh; echo "code de sortie : $?"
input=$(cat)

if echo "$input" | grep -Eq '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then exit 0; fi

cd "$CLAUDE_PROJECT_DIR" || exit 0

# Référence : la branche distante suivie, pour contrôler aussi les commits pas encore poussés.
# Sans branche distante, on se rabat sur HEAD (modifications non commitées seulement).
base=$(git rev-parse --verify -q '@{upstream}' 2>/dev/null || git rev-parse HEAD)

backend_changed=1
git diff --quiet "$base" -- apps/backend && [ -z "$(git ls-files --others --exclude-standard apps/backend)" ] || backend_changed=0

frontend_changed=1
git diff --quiet "$base" -- apps/frontend && [ -z "$(git ls-files --others --exclude-standard apps/frontend)" ] || frontend_changed=0

fail=0
report=""

if [ "$backend_changed" -eq 0 ]; then
  docker compose ps --status running --services 2>/dev/null | grep -q '^backend$' && {
    out=$( { docker compose exec -T backend ruff check . \
          && docker compose exec -T backend python -m pytest; } 2>&1 ) || { fail=1; report+=$'\n--- Backend ---\n'"$out"; }
  }
fi

if [ "$frontend_changed" -eq 0 ]; then
  docker compose ps --status running --services 2>/dev/null | grep -q '^frontend$' && {
    out=$( { docker compose exec -T frontend npm run lint \
          && docker compose exec -T frontend npm run typecheck \
          && docker compose exec -T frontend npm run i18n:check \
          && docker compose exec -T frontend npm run tokens:check; } 2>&1 ) || { fail=1; report+=$'\n--- Frontend ---\n'"$out"; }
  }
fi

if [ "$fail" -eq 1 ]; then
  echo "Contrôles qualité en échec. Corrige avant de conclure :" >&2
  echo "$report" | tail -60 >&2
  exit 2
fi