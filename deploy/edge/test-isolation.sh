#!/usr/bin/env bash
# Test local de l'isolation entre staging et production sur le réseau « edge »
# partagé, comme sur le serveur : deux projets Compose (mizan-staging et
# mizan-production) avec deploy/app/compose.yml, des SECRET_KEY et des bases
# différentes.
#
#   deploy/edge/test-isolation.sh
#   COMPOSE_FILE=/chemin/compose.yml deploy/edge/test-isolation.sh  # autre version (avant correction)
#   N=20 deploy/edge/test-isolation.sh                              # défaut : 100
#
# Le même compte (e-mail, mot de passe) existe dans les deux bases, avec un nom
# différent : une réponse venue de l'autre environnement se voit. Pour chacun :
#   1. résolution DNS depuis le frontend : « backend » (nom du service) et
#      l'hôte d'API_URL, adresses rapportées aux conteneurs ;
#   2. deploy/check-api-url.sh, le garde-fou de deploy/deploy.sh ;
#   3. N connexions par le frontend (POST /api/auth/login, une adresse de
#      visiteur par connexion : limite « auth » par adresse), chacune suivie
#      d'un appel authentifié (GET /api/proxy/auth/me) : 200 et compte du même
#      environnement attendus.
#
# Ne démarre que postgres, redis, backend et frontend : ni Celery, ni ai-service,
# ni sauvegardes ; aucun bucket (archivage WAL-G coupé par
# deploy/edge/compose.isolation-test.yml, propre à ce test), ni domaine, ni
# Caddy. Tout est arrêté et supprimé à la fin, y compris en cas d'échec.
#
# Prérequis : Docker. Construit les images de production backend et frontend si
# elles manquent (plusieurs minutes, phase lourde : infra/scripts/mem-check.sh).
# Refuse de démarrer si un projet mizan-staging ou mizan-production existe déjà.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
COMPOSE_FILE=$(realpath "${COMPOSE_FILE:-$ROOT/deploy/app/compose.yml}")
N=${N:-100}
TAG=isolation-test
REGISTRY=ghcr.io/devzair-officiel
WORK=$(mktemp -d)
CREATED_NETWORK=0
BUILT_IMAGES=()
FAILED=()
LOGIN_EMAIL=recette@example.com
LOGIN_PASSWORD=$(openssl rand -hex 16)
export IMAGE_TAG=$TAG

log() { echo; echo "==> $*"; }
fail() {
  echo "ÉCHEC : $*" >&2
  exit 1
}
compose() {
  local env=$1
  shift
  docker compose --project-name "mizan-$env" --env-file "$WORK/$env.env" --file "$COMPOSE_FILE" \
    --file "$ROOT/deploy/edge/compose.isolation-test.yml" "$@"
}
project_exists() {
  [[ -n $(docker ps -aq --filter "label=com.docker.compose.project=mizan-$1") ||
    -n $(docker volume ls -q --filter "label=com.docker.compose.project=mizan-$1") ]] ||
    docker volume inspect "mizan-$1_postgres-data" >/dev/null 2>&1
}

cleanup() {
  local status=$?
  log "Nettoyage"
  for env in staging production; do
    [[ -f $WORK/$env.env ]] || continue
    compose "$env" down --volumes --remove-orphans --timeout 10 >/dev/null 2>&1 || true
    docker volume ls -q --filter "label=com.docker.compose.project=mizan-$env" \
      | xargs -r docker volume rm >/dev/null || true
  done
  if [[ $CREATED_NETWORK == 1 ]]; then docker network rm edge >/dev/null || true; fi
  for image in "${BUILT_IMAGES[@]}"; do docker image rm "$image" >/dev/null || true; done
  rm -rf "$WORK"
  if [[ $status -eq 0 ]]; then echo "Test réussi."; else echo "Test en échec ($status)." >&2; fi
}

# Les volumes des bases sont supprimés à la fin : jamais sur un environnement existant.
for env in staging production; do
  if project_exists "$env"; then
    rm -rf "$WORK"
    fail "un projet mizan-$env existe déjà sur cette machine : test annulé"
  fi
done
trap cleanup EXIT

set_var() {
  sed -i "/^$2=/d" "$1"
  printf '%s=%s\n' "$2" "$3" >>"$1"
}

# Secrets tirés au hasard pour chaque environnement : SECRET_KEY différentes,
# bases différentes (POSTGRES_DB et volume du modèle de chaque environnement).
write_env_file() {
  local file=$WORK/$1.env
  cp "$ROOT/deploy/env/$1.env.example" "$file"
  for name in SECRET_KEY POSTGRES_PASSWORD APP_DB_PASSWORD REDIS_PASSWORD AI_SERVICE_API_KEY \
    OVH_S3_ACCESS_KEY OVH_S3_SECRET_KEY BACKUP_S3_ACCESS_KEY BACKUP_S3_SECRET_KEY; do
    set_var "$file" "$name" "$(openssl rand -hex 32)"
  done
  set_var "$file" BACKUP_ENCRYPTION_KEY "$(openssl rand -hex 32)"
  set_var "$file" EMAIL_HOST localhost
  set_var "$file" GUNICORN_WORKERS 2
}

build_image() {
  local name=$1 image=$REGISTRY/mizan-$1:$TAG
  docker image inspect "$image" >/dev/null 2>&1 && return 0
  echo "Construction de $image"
  docker build --quiet --target production -t "$image" "$ROOT/apps/$name" >/dev/null
  BUILT_IMAGES+=("$image")
}

start_environment() {
  local env=$1
  log "$env : base, migrations, compte de recette, backend et frontend"
  compose "$env" up --detach --wait --no-build postgres redis
  compose "$env" exec -T postgres mizan-db-roles >/dev/null  # comme deploy/deploy.sh
  compose "$env" run --rm --no-deps -T backend python manage.py migrate --noinput >/dev/null
  compose "$env" run --rm --no-deps -T -e LOGIN_EMAIL -e LOGIN_PASSWORD -e FULL_NAME="Recette $env" \
    backend python manage.py shell -c "
import os
from apps.accounts.models import User
User.objects.create_user(email=os.environ['LOGIN_EMAIL'], password=os.environ['LOGIN_PASSWORD'],
                         full_name=os.environ['FULL_NAME'], is_active=True)"
  compose "$env" up --detach --wait --wait-timeout 180 --no-build backend frontend
}

# Conteneur de chaque adresse des backends et frontends des deux projets.
describe_address() {
  local id
  for id in $(docker ps -q --filter label=com.docker.compose.project=mizan-staging) \
    $(docker ps -q --filter label=com.docker.compose.project=mizan-production); do
    if docker inspect --format '{{range .NetworkSettings.Networks}} {{.IPAddress}} {{end}}' "$id" \
      | grep -q " $1 "; then
      docker inspect --format '{{slice .Name 1}}' "$id"
      return
    fi
  done
  echo "inconnu"
}

show_dns() {
  local env=$1 line name address
  log "$env : résolution DNS depuis le frontend"
  # shellcheck disable=SC2016  # gabarit JavaScript, pas Bash
  compose "$env" exec -T frontend node -e '
    const dns = require("node:dns").promises;
    (async () => {
      for (const name of ["backend", new URL(process.env.API_URL).hostname]) {
        const list = await dns.lookup(name, { all: true }).catch(() => []);
        console.log(name, ...list.map((entry) => entry.address));
      }
    })();' >"$WORK/dns"
  while read -r line; do
    read -ra parts <<<"$line"
    name=${parts[0]}
    printf '  %-26s → %s adresse(s) :' "$name" "$((${#parts[@]} - 1))"
    for address in "${parts[@]:1}"; do printf ' %s (%s)' "$address" "$(describe_address "$address")"; done
    echo
  done <"$WORK/dns"
}

# N connexions puis /auth/me, quatre à la fois, depuis le conteneur frontend.
# shellcheck disable=SC2016  # gabarit JavaScript, pas Bash
LOAD_JS='
const n = Number(process.env.N);
const { EXPECTED: env, OTHER: other, LOGIN_EMAIL: email, LOGIN_PASSWORD: password } = process.env;
const base = "http://127.0.0.1:3000/api";
const tally = {};
const count = (key) => { tally[key] = (tally[key] ?? 0) + 1; };
async function attempt(i) {
  const ip = `10.77.${Math.floor(i / 250)}.${(i % 250) + 1}`;
  const login = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ email, password }),
  });
  if (!login.ok) return count(`connexion refusée (${login.status})`);
  const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const me = await fetch(`${base}/proxy/auth/me`, { headers: { cookie, "x-forwarded-for": ip } });
  if (!me.ok) return count(`auth/me refusé (${me.status})`);
  const { full_name: name } = await me.json();
  if (name === `Recette ${env}`) return count("réussies");
  count(name === `Recette ${other}` ? `compte de ${other} servi à ${env}` : `compte inattendu (${name})`);
}
let next = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (next < n) await attempt(next++).catch((error) => count(`erreur (${error.cause?.code ?? error.message})`));
}));
for (const [key, value] of Object.entries(tally)) console.log(`  ${key} : ${value}/${n}`);
process.exit(tally["réussies"] === n ? 0 : 1);'

run_load() {
  local env=$1 other=$2
  log "$env : $N connexions, chacune suivie de GET /api/proxy/auth/me"
  if ! compose "$env" exec -T -e N="$N" -e EXPECTED="$env" -e OTHER="$other" \
    -e LOGIN_EMAIL -e LOGIN_PASSWORD frontend node --input-type=module -e "$LOAD_JS"; then
    FAILED+=("$env : connexions")
  fi
}

log "Préparation : $COMPOSE_FILE, images $TAG"
export LOGIN_EMAIL LOGIN_PASSWORD
write_env_file staging
write_env_file production
if ! docker network inspect edge >/dev/null 2>&1; then
  docker network create edge >/dev/null
  CREATED_NETWORK=1
fi
build_image backend
build_image frontend
# Image PostgreSQL toujours construite avec le fichier du dépôt (contexte deploy/postgres).
docker image inspect mizan-postgres:16 >/dev/null 2>&1 || BUILT_IMAGES+=(mizan-postgres:16)
docker compose --project-name mizan-staging --env-file "$WORK/staging.env" \
  --file "$ROOT/deploy/app/compose.yml" build --quiet postgres

start_environment staging
start_environment production

for env in staging production; do
  other=$([[ $env == staging ]] && echo production || echo staging)
  show_dns "$env"
  log "$env : garde-fou de deploy.sh (deploy/check-api-url.sh)"
  ENV_FILE=$WORK/$env.env COMPOSE_FILE=$COMPOSE_FILE "$ROOT/deploy/check-api-url.sh" "$env" \
    || FAILED+=("$env : garde-fou")
  run_load "$env" "$other"
done

if [[ ${#FAILED[@]} -gt 0 ]]; then
  fail "$(IFS=';'; echo "${FAILED[*]}")"
fi
