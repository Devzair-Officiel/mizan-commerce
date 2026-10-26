#!/usr/bin/env bash
# Vérifie, sur un environnement démarré, que le frontend joint SON backend :
# le nom d'hôte d'API_URL, résolu DEPUIS le conteneur frontend, doit donner une
# seule adresse, celle du backend du même projet. Lancé par deploy/deploy.sh
# après /healthz ; utilisable seul sur le serveur.
#
# Lecture seule : ne démarre, n'arrête ni ne modifie aucun conteneur (compose ps,
# docker inspect, et une résolution DNS par node dans le frontend). En cas
# d'échec : message, code 1, conteneurs laissés tels quels.
#
#   deploy/check-api-url.sh <production|staging>
#
# Variables facultatives :
#   ENV_FILE=…      fichier de variables (défaut : deploy/env/<env>.env)
#   COMPOSE_FILE=…  défaut : deploy/app/compose.yml (tests : deploy/edge/test-isolation.sh)
#
# Sur le réseau edge partagé, le nom du service (« backend ») désigne les
# backends des deux environnements : une requête sur deux part chez l'autre
# (docs/exploitation/deploiement.md, « Réseau edge partagé »).
set -euo pipefail

[[ $# -eq 1 && ($1 == production || $1 == staging) ]] \
  || { echo "Usage : $0 <production|staging>" >&2; exit 2; }
ENVIRONMENT=$1
DEPLOY_DIR=$(cd "$(dirname "$0")" && pwd)
ENV_FILE=$(realpath "${ENV_FILE:-$DEPLOY_DIR/env/$ENVIRONMENT.env}")
COMPOSE_FILE=$(realpath "${COMPOSE_FILE:-$DEPLOY_DIR/app/compose.yml}")
[[ -f $ENV_FILE ]] || { echo "Fichier de variables absent : $ENV_FILE" >&2; exit 1; }
# Exigée par compose.yml, sans effet sur exec ni ps (conteneurs déjà créés).
export IMAGE_TAG=${IMAGE_TAG:-courante}

compose() {
  docker compose --project-name "mizan-$ENVIRONMENT" --env-file "$ENV_FILE" \
    --file "$COMPOSE_FILE" "$@"
}

backend_id=$(compose ps -q backend)
[[ -n $backend_id ]] || { echo "Backend de $ENVIRONMENT non démarré." >&2; exit 1; }
read -ra backend_ips <<< "$(docker inspect \
  --format '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' "$backend_id")"

# shellcheck disable=SC2016  # ${hostname} : gabarit JavaScript, pas Bash
if ! resolution=$(compose exec -T frontend node -e '
  const { hostname } = new URL(process.env.API_URL);
  require("node:dns").lookup(hostname, { all: true }, (error, list) => {
    if (error) { console.error(`${hostname} : ${error.code}`); process.exit(1); }
    console.log(hostname, ...list.map((entry) => entry.address));
  });' 2>&1); then
  echo "✗ API_URL ne se résout pas depuis le frontend de $ENVIRONMENT : $resolution" >&2
  exit 1
fi
read -ra resolved <<< "$resolution"
api_host=${resolved[0]}
api_ips=("${resolved[@]:1}")

if [[ ${#api_ips[@]} -ne 1 || " ${backend_ips[*]} " != *" ${api_ips[0]} "* ]]; then
  echo "✗ API_URL ($api_host) se résout depuis le frontend de $ENVIRONMENT en :" \
    "${api_ips[*]:-aucune adresse}." >&2
  echo "  Attendu : une seule adresse, celle du backend de $ENVIRONMENT (${backend_ips[*]})." >&2
  echo "  API_URL doit viser l'alias unique mizan-$ENVIRONMENT-backend (deploy/app/compose.yml ;" \
    "deploy/check-compose.sh ; docs/exploitation/deploiement.md, « Réseau edge partagé »)." >&2
  exit 1
fi
echo "✓ $ENVIRONMENT : API_URL ($api_host) → ${api_ips[0]}, backend de $ENVIRONMENT"
