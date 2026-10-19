# CLAUDE.md

> Lu automatiquement par Claude Code à chaque session. Garder court et actionnable.

## Project

SaaS mobile-first pour petits commerçants. Backend Python (Django + DRF), frontend React (Next.js + TypeScript), PostgreSQL, Redis + Celery, OVHcloud. Détails complets dans `docs/project_instructions_saas_commercants.md` — lire ce fichier avant toute décision d'architecture.

## Map

```
apps/frontend/   Next.js + TypeScript + Tailwind + shadcn/ui
apps/backend/    Django + Django REST Framework
apps/ai-service/ FastAPI (OCR, détection visuelle — V6)
infra/           Docker, nginx, configs
docs/            URS, schéma DB, plan d'avancement
```

Documents de référence (à consulter selon le besoin, pas à charger systématiquement) :
- `docs/urs_saas_commercant_mobile.md` — user stories URS-001 à URS-103
- `docs/schema_base_donnees.md` — schéma PostgreSQL canonique
- `docs/plan_avancement.md` — phase et tâches en cours
- `docs/fiche_technique_saas_commercants_ovh.md` — choix d'infra OVH
- `docs/design_principles.md` — posture UX/UI + patterns canoniques (lire avant tout redesign d'écran)
- `docs/zakat_referentiel.md` — règles, sources et textes de la zakat ; à lire avant toute modification du module

## Commands

```bash
# Backend (depuis apps/backend)
docker compose exec backend pytest -n auto    # Suite complète, en parallèle (pytest-xdist : une base de test par worker) : 4 workers en local (PYTEST_XDIST_AUTO_NUM_WORKERS) ; davantage sur demande : -n 8
docker compose exec backend pytest apps/<app>  # Tests d'une app
docker compose exec backend pytest path/file::test_name  # Test ciblé
docker compose exec backend ruff check .      # Lint
docker compose exec backend ruff format .     # Format
docker compose exec backend python manage.py makemigrations
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py seed_data           # Dev uniquement (DEBUG=True requis)
docker compose exec backend python manage.py seed_data --reset   # seed_data --reset : développement uniquement, ne touche qu'aux comptes de démo (@example.*)

# Frontend (depuis la racine du repo)
docker compose exec -T frontend npm run dev      # Dev server
docker compose exec -T frontend npm run typecheck  # Typecheck obligatoire avant tout commit frontend : le build ne vérifie pas les types
docker compose exec -T frontend npm run i18n:check  # Obligatoire avant tout commit qui touche aux messages (fr/en/ar)
docker compose exec -T frontend npm run tokens:check  # Obligatoire avant tout commit frontend : couleurs via tokens (pas de gris de palette ni d'hexadécimal dans un className)
docker compose exec -T frontend npm run text:check  # Obligatoire avant tout commit frontend : aucun texte d'interface en dur (JSX, title, aria-label, placeholder, alt) — tout passe par t()
docker compose exec -T frontend npm run deps:check  # Obligatoire avant tout commit frontend : @base-ui/utils installé une seule fois, à la version qu'attend @base-ui/react — deux copies font deux verrous de défilement qui s'ignorent, et la page reste bloquée (6e3b998)
docker compose exec -T frontend npm run lint     # ESLint
docker compose restart frontend && docker compose exec -T frontend npm run build    # Build de prod, toujours après redémarrage du frontend (le serveur de dev grossit jusqu'à faire tuer le build faute de mémoire)
# npm run test n'existe pas encore — aucune infra Vitest en place

# Stack complète
docker compose up -d

# Audits navigateur Playwright (sans Node sur la machine, service `e2e` du profil « audit ») — voir apps/frontend/e2e/README.md
docker compose run --rm e2e                              # tous les audits, un à la fois (AUDIT_JOBS=1 ; 2 en préfixe après validation des mesures), en smoke (1440 fr clair + 360 ar sombre), boutiques d'audit remises à zéro avant
docker compose run --rm e2e npm run audit -- sales scroll-lock  # un audit ou une liste (remise à zéro aussi ; --no-deps pour garder les données)
AUDIT_MATRIX=full docker compose run --rm e2e            # les 8 configurations (fr/ar × clair/sombre × 1440/360) : préparation de PR ou demande explicite seulement

# Garde-fou mémoire des phases lourdes (voir « Vérifications ») — journal : ~/.local/state/mizan-commerce/mem.log
infra/scripts/mem-check.sh                               # état : 0 rien à signaler, 1 pression mémoire, 2 phase lourde déjà en cours
MEM_LABEL="audit sales" infra/scripts/mem-check.sh run docker compose run --rm e2e npm run audit -- sales  # lance si l'état est 0, relève la mémoire, pics en fin
docker compose exec backend python manage.py reset_audit_shop  # Dev uniquement : supprime et recrée les boutiques d'audit (e2e@, e2e2@, e2e3@, e2e-invoices@example.com)
```

## Code rules — Backend (Python / Django)

- Python ≥ 3.12, Django ≥ 5.x, type hints **obligatoires** sur toute fonction publique.
- Architecture par app Django : un domaine = une app (`products/`, `orders/`, `stock/`, `customers/`, `zakat/`…). Pas de "core" fourre-tout.
- **Séparation des responsabilités** : modèles (ORM uniquement), services (logique métier dans `services.py`), serializers (validation/sérialisation DRF), views (orchestration HTTP fine, sans logique métier).
- Logique métier non triviale → toujours dans `services.py`, **jamais dans les views ni les serializers**.
- Argent : `Decimal` uniquement, jamais `float`. Devise via `shop.currency`.
- Stock : ne **jamais** modifier `product.stock_quantity` directement. Toujours créer un `StockMovement` via `stock.services.create_movement()`. La quantité est dérivée.
- Multi-tenant : tout queryset filtré par `shop_id` du membre courant. Utiliser le mixin `ShopScopedQuerysetMixin`. **Aucune** vue qui retourne des données sans filtrage explicite par boutique.

## Code rules — Frontend (TypeScript / React)

- TypeScript strict, **pas de `any`**. Si un type est compliqué, demander avant de tricher.
- Pas de `default export` sauf pour les pages Next.js (où le framework l'impose).
- Composants : **un seul composant exporté par fichier**, nom du fichier = nom du composant. Un petit sous-composant privé (icône, élément de liste, moins de ~25 lignes) peut rester dans le fichier qui l'utilise.
- État serveur : **TanStack Query** uniquement (jamais `useEffect` + `fetch` à la main).
- **Jamais d'action utilisateur** (ajout, enregistrement, envoi) déclenchée dans un `useEffect` : uniquement dans le gestionnaire d'événement.
- Formulaires : **React Hook Form + Zod**. Le schéma Zod sert aussi de type TS via `z.infer<>`.
- UI : composants shadcn/ui en priorité avant d'en créer un. Tailwind utility-first, pas de CSS custom sauf cas exceptionnel.
- **Classes Tailwind** : préférer les classes de l'échelle (`min-h-14`, `w-18`, `h-4.5`…) aux valeurs arbitraires en px (`min-h-[56px]`, `w-[72px]`…) quand un équivalent existe. Positions logiques : `inset-s-*`/`inset-e-*` au lieu de `start-*`/`end-*` (sauf grille : `col-start-*` inchangé).
- **i18n — texte dépendant du type de catalogue** : utiliser un seul paramètre ICU `{kind, select, products {...} services {...} other {...}}` (jamais de clés séparées `_products`/`_services`, jamais de ternaires côté composant). Hook source : `useCatalogKind()` dans `lib/hooks/useCatalogKind.ts`. Pluriels imbriqués : `{kind, select, products {{count, plural, one {# article} other {# articles}}} ...}`.
- **Interface en français : vouvoiement.** « Ajoutez », « votre boutique », jamais « Ajoute », « ta boutique ». Contrôlé par `npm run i18n:check` sur `fr.json` (exceptions explicites dans `scripts/check-i18n.mjs`).

## Architecture rules — universelles

- **Avant d'écrire du code, lire** : si un fichier proche fait une chose similaire, suivre son pattern. Cohérence > élégance.
- **Factoriser après duplication, pas avant** : règle du "rule of three". Deux fois c'est OK, trois fois → extraire.
- **Une seule abstraction à la fois** : pas de wrapper d'un wrapper. Si on n'utilise une abstraction qu'à un seul endroit, c'est probablement prématuré.
- Pas de fonction qui dépasse ~50 lignes. Un composant React se découpe au-delà de ~80 lignes. Pas de classe qui dépasse ~300 lignes. Si ça dépasse, signaler avant de continuer.
- Modifier le minimum de fichiers nécessaire. Ne pas refactorer du code non lié à la tâche.

## Security — non négociable

Avant de proposer du code, vérifier ces points. Si un point est violé, **arrêter et signaler** plutôt que générer.

- **Aucun secret en clair** dans le code (clés API, tokens Stripe, bot tokens Telegram, mots de passe DB). Toujours via variables d'environnement (`os.environ`, `process.env`). Le `.env` est dans `.gitignore`.
- **Aucune requête SQL brute** sans paramétrage. Utiliser l'ORM Django ou des requêtes paramétrées explicites.
- **Validation côté serveur obligatoire**, même si déjà validé côté client. Le client est public, jamais une source de vérité.
- **Sortie de données** : ne jamais sérialiser un modèle entier vers le frontend. Toujours passer par un serializer DRF qui liste explicitement les champs exposés. Pas de `fields = '__all__'`.
- **Multi-tenant** : avant tout `.objects.get(...)` ou `.objects.filter(...)`, vérifier que la query est scopée à la boutique courante. Sinon : faille de sécurité.
- **Fichiers** : uploads dans bucket privé par défaut. URL signées pour la lecture. Vérifier `mime_type` et taille avant stockage.
- **Logs et erreurs** : ne jamais logger de mot de passe, token, ou contenu de fichier. Stack traces uniquement côté serveur, jamais renvoyées au client en production.
- **CORS** strict, **CSRF** activé, cookies `Secure` + `HttpOnly` + `SameSite=Lax` minimum.
- **Tokens JWT** : ne jamais stocker un token dans `localStorage` ou `sessionStorage` (vulnérable XSS). Utiliser exclusivement des cookies `HttpOnly` posés par un route handler Next.js côté serveur. Le JS client ne doit jamais lire ni écrire un token.
- **Route handlers Next.js** : tout appel authentifié au backend Django passe par `/app/api/*` (proxy server-side). Le cookie est lu par le serveur Next.js, le header `Authorization` est ajouté côté serveur, jamais exposé au client.
- **Inputs** : toujours sanitiser et valider côté serveur (DRF serializers). Côté client (Zod) = confort UX uniquement, pas une ligne de défense.
- **Dépendances** : ne pas introduire un package npm ou PyPI sans vérifier qu'il est maintenu et sans faille connue critique. Préférer les packages avec >1M téléchargements/semaine et maintenance active.
- **Erreurs API** : ne jamais renvoyer de stack trace, de chemin de fichier, ou de détail interne au client en production. Les messages d'erreur exposés sont génériques côté client, détaillés uniquement dans les logs serveur.

## Workflow

- Quand une tâche est ambiguë, **poser une question** avant de coder. Ne pas inventer.
- **Ne jamais contourner une permission refusée** (par un conteneur, un autre outil ou une autre commande) : s'arrêter et me demander.
- **Enchaîner les commandes Git et de déploiement avec `&&` ou `set -e`** : s'arrêter à la première erreur, ne jamais continuer sur un état intermédiaire.
- Pour les modèles ou endpoints, vérifier le schéma dans `docs/schema_base_donnees.md` avant.
- Toute nouvelle fonctionnalité doit pouvoir se rattacher à un URS (URS-XXX). Si rien ne couvre, le signaler.
- Après modification du modèle Django : générer la migration et la mentionner explicitement.
- À la fin d'une tâche, indiquer la ligne du `docs/plan_avancement.md` à cocher.
- **À chaque nouvelle app Django** : créer `apps/backend/apps/<app>/factories.py` avec des factories `factory_boy` + `faker` pour tous les modèles de l'app. Ajouter le seeding correspondant dans `apps/core/management/commands/seed_data.py`. Tester avec : `docker compose exec backend python manage.py seed_data`.
- **Vérifications navigateur : console surveillée, aucune erreur ni avertissement React toléré.** Seule exception : les messages de développement de Next.js qui ne viennent pas de notre code (Fast Refresh, HMR, invitation React DevTools). L'aperçu de la page publique (iframe sandbox, origine opaque) produit en dev des erreurs de ressources de développement : attendues, ne pas assouplir le sandbox. Vérification automatisée : l'audit de la page concernée (`docker compose run --rm e2e npm run audit -- <audit>`).
- **Vérifications** : suivre la section « Vérifications » ci-dessous. Un test dans une autre app peut échouer à cause du changement — le `SeedDataTest` dans `apps/core/tests.py` en est l'exemple type : si modèles, factories ou seed changent, lancer aussi `pytest apps/core` ; la suite complète d'avant PR rattrape le reste.

## Vérifications

Du plus ciblé au plus large : les suites complètes ne sont **pas** lancées à chaque fin de prompt.

- **Pendant le développement** : contrôles ciblés sur ce qui change — `pytest apps/<app>` (ou le fichier, le test), `ruff check .` ; côté frontend, lint, typecheck et contrôles npm (i18n, tokens, text, deps).
- **Après une modification significative** (fin de tâche, commit) : tests des apps concernées, `makemigrations --check` si un modèle change ; si l'interface change, audit ciblé en smoke (`docker compose run --rm e2e npm run audit -- <audit>`). Suite smoke complète seulement pour un changement transversal (layout, composant partagé), en le signalant.
- **Avant une pull request**, avec mon accord, l'une après l'autre : `pytest -n auto` complet, `makemigrations --check`, build (après `docker compose restart frontend`), suite smoke, puis matrice full (`AUDIT_MATRIX=full docker compose run --rm e2e`). La matrice full ne sert qu'à cela, ou sur demande explicite.

**Mémoire** (une saturation fait fermer la session Ubuntu par systemd-oomd) :
- Phases lourdes : pytest complet, build, tout audit. **Une seule à la fois, jamais en arrière-plan pendant une autre.** Commandes légères (ruff, lint, typecheck, contrôles npm, pytest d'une app) : libres.
- Chaque phase lourde passe par `infra/scripts/mem-check.sh run <commande>`. Code 1 (pression) ou 2 (phase en cours) : ne pas lancer, suspendre les phases lourdes et me prévenir avec la ligne affichée. `MEM_FORCE=1` uniquement après mon accord explicite.
- Toujours `docker compose restart frontend` avant un build.
- Audits : `AUDIT_JOBS=1` par défaut ; 2 seulement après validation des mesures, en préfixe (`AUDIT_JOBS=2 docker compose run …`, jamais `-e`) pour qu'e2e-reset crée autant de boutiques. Un audit terminé ne laisse ni navigateur (sinon ✗ « processus Chromium encore ouverts ») ni conteneur e2e (signalé par mem-check).

## Self-check before responding

Avant de produire la réponse finale, relire mentalement :
1. Le code respecte-t-il la séparation views / services / models ?
2. Y a-t-il un secret, une donnée sensible, ou une fuite de données entre boutiques ?
3. Est-ce que je duplique du code qui existe déjà ailleurs dans le repo ?
4. Le typage est-il complet (Python type hints, TS strict sans `any`) ?
5. Si j'ai fait un choix non évident, l'ai-je expliqué en une phrase ?
6. **Sécurité — checklist rapide** :
   - Les tokens JWT sont-ils dans des cookies `HttpOnly` uniquement ? (jamais `localStorage`)
   - Les route handlers Next.js proxifient-ils correctement sans exposer le token au client ?
   - Les inputs sont-ils validés côté serveur, pas seulement côté client ?
   - Les erreurs renvoyées au client sont-elles génériques (pas de stack trace, pas de chemin) ?
   - Les querysets Django sont-ils tous scopés au `shop_id` du membre courant ?
   - Les fichiers uploadés sont-ils dans un bucket privé avec URL signées ?
   - Y a-t-il un risque XSS, injection SQL, IDOR, ou CSRF dans ce code ?

Si l'un des points pose problème, **corriger avant de répondre**.
