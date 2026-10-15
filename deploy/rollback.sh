#!/usr/bin/env bash
# Revient à la version précédente d'un environnement.
#
#   deploy/rollback.sh <production|staging>
#
# Les versions déployées sont inscrites, une par ligne, dans
# deploy/state/<env>.tags (deploy.sh). Ce script redéploie l'avant-dernière avec
# deploy.sh, puis retire la dernière de la liste : un second appel remonte d'une
# version de plus. Les migrations ne sont pas annulées : chaque migration doit
# rester compatible avec la version précédente (docs/exploitation/deploiement.md).
#
# Accepte les mêmes variables facultatives que deploy.sh (ENV_FILE, NO_PULL).
set -euo pipefail

[[ $# -eq 1 && ($1 == production || $1 == staging) ]] \
  || { echo "Usage : $0 <production|staging>" >&2; exit 2; }
ENVIRONMENT=$1

DEPLOY_DIR=$(cd "$(dirname "$0")" && pwd)
STATE_FILE=$DEPLOY_DIR/state/$ENVIRONMENT.tags

[[ -f $STATE_FILE ]] || { echo "Aucune version inscrite : $STATE_FILE" >&2; exit 1; }
mapfile -t TAGS < "$STATE_FILE"
if [[ ${#TAGS[@]} -lt 2 ]]; then
  echo "Aucune version précédente dans $STATE_FILE" >&2
  exit 1
fi
CURRENT=${TAGS[-1]}
PREVIOUS=${TAGS[-2]}

echo "==> [$ENVIRONMENT] Retour de $CURRENT à $PREVIOUS"
NO_RECORD=1 "$DEPLOY_DIR/deploy.sh" "$ENVIRONMENT" "$PREVIOUS"

# Version courante retirée seulement après un retour réussi.
sed -i '$d' "$STATE_FILE"
echo "==> [$ENVIRONMENT] Version en service : $PREVIOUS"
