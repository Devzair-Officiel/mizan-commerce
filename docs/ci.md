# Intégration continue

Workflow : `.github/workflows/ci.yml` (GitHub Actions). Il se lance sur chaque pull request vers `main` et sur chaque push vers `main` ou `feature/**`. Un nouveau push annule l'exécution en cours de la même branche.

| Job | Contenu |
|---|---|
| `backend` | Python 3.12, PostgreSQL 16 et Redis 7 (mêmes images que `docker-compose.yml`) ; `ruff check`, `makemigrations --check --dry-run`, `pytest -n auto` |
| `frontend` | Node 20 (comme `node:20-alpine`) ; `npm ci`, lint, typecheck, `i18n:check`, `tokens:check`, `text:check`, `deps:check`, build |
| `docker` | Construction des images de production backend et frontend, sans publication (cache GitHub Actions) |

Le CI n'utilise **aucun secret**. Les variables OVH sont vides, donc `is_storage_configured()` est faux. Les tests d'upload forcent leurs réglages avec `override_settings` et simulent boto3 avec `patch` : aucun test ne contacte le bucket, même en local avec un `.env` complet. Un test qui dépendrait des variables OVH du `.env` passerait en local mais échouerait en CI. Pour le reproduire en local :

```bash
docker compose run --rm --no-deps -e OVH_S3_ACCESS_KEY= -e OVH_S3_SECRET_KEY= \
  -e OVH_S3_ENDPOINT_URL= -e OVH_S3_BUCKET_PRIVATE= -e AI_SERVICE_API_KEY= \
  backend pytest -n auto
```

Les suites d'audits Playwright ne tournent pas en CI : elles restent locales (`docker compose run --rm e2e`).

Dependabot (`.github/dependabot.yml`) ouvre chaque lundi :
- une pull request groupée par écosystème (npm, pip, actions) pour les versions mineures et correctives ;
- une pull request par paquet pour les versions majeures.

Chacune passe par le CI.

## Protéger `main` sur GitHub

À faire une fois, après une première exécution du workflow : avant elle, GitHub ne propose pas les jobs comme vérifications.

1. **Settings → Rules → Rulesets → New ruleset → New branch ruleset.**
2. Nom : `main`. **Enforcement status** : *Active*.
3. **Target branches** : *Add target → Include default branch* (`main`).
4. **Bypass list** : laisser vide. Personne ne contourne la règle, pas même les administrateurs.
5. Cocher :
   - **Restrict deletions** ;
   - **Block force pushes** ;
   - **Require a pull request before merging** : *Required approvals* à `0` tant que vous êtes seul sur le dépôt (GitHub interdit d'approuver sa propre pull request) ; cocher *Dismiss stale pull request approvals when new commits are pushed* ;
   - **Require status checks to pass** : cocher *Require branches to be up to date before merging*, puis *Add checks* : `backend`, `frontend`, `docker` (source : GitHub Actions).
6. **Create.**

Résultat : plus de push direct ni de push forcé sur `main`. Toute fusion passe par une pull request dont les trois jobs sont verts.

Variante si les rulesets ne sont pas disponibles : **Settings → Branches → Add classic branch protection rule**, motif `main`, mêmes cases : *Require a pull request*, *Require status checks* avec les trois jobs, *Do not allow bypassing*. Les push forcés et la suppression restent interdits par défaut.

À activer aussi dans **Settings → Code security** : *Dependabot alerts* et *Dependabot security updates*.
