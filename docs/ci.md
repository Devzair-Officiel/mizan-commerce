# Intégration continue

Workflow : `.github/workflows/ci.yml` (GitHub Actions). Un nouveau push annule l'exécution en cours de la même pull request ; sur `main`, les exécutions se suivent sans s'interrompre. Il se lance :
- sur chaque pull request vers `main` ;
- sur chaque push vers `main` ;
- à la main (`workflow_dispatch`), pour une branche sans pull request : **Actions → CI → Run workflow**, choisir la branche.

Un push sur une branche de travail ne lance rien tant qu'aucune pull request n'est ouverte : une seule exécution par push. GitHub ne propose `workflow_dispatch` que si le workflow existe sur `main`.

| Job | Contenu |
|---|---|
| `backend` | Python 3.12, PostgreSQL 16 et Redis 7 (mêmes images que `docker-compose.yml`) ; `ruff check`, `makemigrations --check --dry-run`, `pytest -n auto` |
| `frontend` | Node 20 (comme `node:20-alpine`) ; `npm ci`, lint, typecheck, `i18n:check`, `tokens:check`, `text:check`, `deps:check`, build |
| `docker` | Après `backend` et `frontend` : images de production backend, frontend et ai-service (cache GitHub Actions). Publiées sur GHCR seulement sur un push vers `main` ; construites sans publication sinon |

Le CI n'utilise **aucun secret** du dépôt : la publication sur GHCR passe par le `GITHUB_TOKEN` fourni par GitHub. Les variables OVH sont vides, donc `is_storage_configured()` est faux. Les tests d'upload forcent leurs réglages avec `override_settings` et simulent boto3 avec `patch` : aucun test ne contacte le bucket, même en local avec un `.env` complet. Un test qui dépendrait des variables OVH du `.env` passerait en local mais échouerait en CI. Pour le reproduire en local :

```bash
docker compose run --rm --no-deps -e OVH_S3_ACCESS_KEY= -e OVH_S3_SECRET_KEY= \
  -e OVH_S3_ENDPOINT_URL= -e OVH_S3_BUCKET_PRIVATE= -e AI_SERVICE_API_KEY= \
  backend pytest -n auto
```

## Images publiées (GHCR)

Sur chaque push vers `main`, le job `docker` publie :

| Image | Contenu |
|---|---|
| `ghcr.io/devzair-officiel/mizan-backend` | Django + gunicorn ; même image pour les workers Celery et Celery Beat (autre commande) |
| `ghcr.io/devzair-officiel/mizan-frontend` | Next.js, sortie standalone |
| `ghcr.io/devzair-officiel/mizan-ai-service` | FastAPI + PaddleOCR |

Deux étiquettes par image : l'identifiant complet du commit (celle qu'on déploie, voir `docs/exploitation/deploiement.md`) et `latest`. Le backend reçoit l'identifiant comme release Sentry (`SENTRY_RELEASE`), le frontend aussi (`NEXT_PUBLIC_SENTRY_RELEASE`).

Les variables `NEXT_PUBLIC_*` sont inlinées dans le bundle du navigateur : elles se fixent à la construction, pas au démarrage. Une même image sert à staging et à la production, donc ces valeurs sont communes aux deux. Les déclarer dans **Settings → Secrets and variables → Actions → Variables** (onglet *Variables*, pas *Secrets* : elles sont publiques par nature) :

| Variable | Valeur |
|---|---|
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | Clé de site reCAPTCHA v3 (domaines de production et de staging déclarés chez Google) |
| `NEXT_PUBLIC_SENTRY_DSN` | DSN du projet Sentry frontend ; absente = Sentry désactivé |
| `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | Part des transactions envoyées, de `0` à `1` ; absente = `0` |

L'environnement Sentry n'en fait pas partie : côté serveur, il vient de `SENTRY_ENVIRONMENT` (fichier d'environnement du serveur) ; dans le navigateur, du domaine (`staging.*` → `staging`, sinon `production`).

Après la première publication, les paquets apparaissent dans **Profil ou organisation → Packages**, privés par défaut. Les laisser privés : le serveur s'authentifie une fois avec `docker login ghcr.io` et un jeton *classic* limité à `read:packages` (procédure dans `docs/exploitation/deploiement.md`). Dans **Package settings** de chaque paquet, vérifier que le dépôt `mizan-commerce` a l'accès *Write* (*Manage Actions access*), sinon les publications suivantes échouent.

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
