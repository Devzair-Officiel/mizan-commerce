#!/usr/bin/env bash
# Contrôle statique de deploy/app/compose.yml, pour staging ET production, avec
# les modèles deploy/env/<env>.env.example (variables vides remplacées par une
# valeur factice) : ni serveur, ni secret, ni conteneur.
#
#   deploy/check-compose.sh
#   COMPOSE_FILE=… deploy/check-compose.sh   # autre fichier (non-régression)
#
# Réseau « edge » partagé : Compose y inscrit le NOM DU SERVICE (« backend »,
# « frontend ») de chaque environnement. Un service qui rejoint edge ne doit
# joindre un pair que par son alias unique mizan-<env>-<service>, ou par un nom
# absent d'edge (réseau privé du projet). Échoue sinon, notamment si API_URL
# vise le nom nu « backend » (docs/exploitation/deploiement.md, « Réseau edge
# partagé »).
set -euo pipefail

DEPLOY_DIR=$(cd "$(dirname "$0")" && pwd)
COMPOSE_FILE=$(realpath "${COMPOSE_FILE:-$DEPLOY_DIR/app/compose.yml}")
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

status=0
for env in staging production; do
  sed -E 's/^([A-Z0-9_]+)=$/\1=factice/' "$DEPLOY_DIR/env/$env.env.example" > "$WORK/$env.env"
  IMAGE_TAG=check docker compose --project-name "mizan-$env" --env-file "$WORK/$env.env" \
    --file "$COMPOSE_FILE" config --format json > "$WORK/$env.json"
  python3 - "$env" "$WORK/$env.json" <<'PY' || status=1
import json
import re
import sys

env, path = sys.argv[1], sys.argv[2]
other = {"staging": "production", "production": "staging"}[env]
services = json.load(open(path))["services"]
errors = []


def edge_aliases(service: dict) -> list[str]:
    edge = (service.get("networks") or {}).get("edge") or {}
    return edge.get("aliases") or []


on_edge = sorted(name for name, s in services.items() if "edge" in (s.get("networks") or {}))
backend = f"mizan-{env}-backend"

# API_URL : l'alias unique du backend du même environnement, autorisé par Django.
api_url = services["frontend"].get("environment", {}).get("API_URL", "")
match = re.match(r"^https?://([^:/]+)", api_url)
api_host = match.group(1) if match else ""
if api_host != backend:
    errors.append(f"frontend API_URL={api_url!r} : attendu l'hôte {backend}")
if backend not in edge_aliases(services["backend"]):
    errors.append(f"backend : alias {backend} absent du réseau edge")
allowed = services["backend"].get("environment", {}).get("DJANGO_ALLOWED_HOSTS", "")
if api_host == backend and api_host not in [h.strip() for h in allowed.split(",")]:
    errors.append(f"backend DJANGO_ALLOWED_HOSTS={allowed!r} : {api_host} absent (400 DisallowedHost)")

# Règle générale : aucune URL d'un service rattaché à edge ne vise le nom nu
# d'un service rattaché à edge, ni un alias de l'autre environnement.
url_host = re.compile(r"[a-z][a-z0-9+.-]*://(?:[^@/\s]*@)?([^:/\s,]+)")
for name in on_edge:
    for key, value in (services[name].get("environment") or {}).items():
        for host in url_host.findall(str(value or "")):
            if host in on_edge:
                errors.append(f"{name} {key} : nom nu « {host} », ambigu sur edge : utiliser mizan-{env}-{host}")
            elif host.startswith(f"mizan-{other}-"):
                errors.append(f"{name} {key} : « {host} » appartient à l'autre environnement")

if errors:
    print(f"✗ {env} : la configuration peut joindre l'autre environnement par edge", file=sys.stderr)
    for error in errors:
        print(f"  - {error}", file=sys.stderr)
    print("  Voir docs/exploitation/deploiement.md, « Réseau edge partagé ».", file=sys.stderr)
    sys.exit(1)
print(f"✓ {env} : API_URL → {api_host} ; services sur edge : {', '.join(on_edge)}")
PY
done
exit "$status"
