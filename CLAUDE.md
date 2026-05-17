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
- `docs/urs_saas_commercant_mobile.md` — user stories URS-001 à URS-088
- `docs/schema_base_donnees.md` — schéma PostgreSQL canonique
- `docs/plan_avancement.md` — phase et tâches en cours
- `docs/fiche_technique_saas_commercants_ovh.md` — choix d'infra OVH

## Commands

```bash
# Backend (depuis apps/backend)
docker compose exec backend pytest            # Tests
docker compose exec backend pytest path/file::test_name  # Test ciblé
docker compose exec backend ruff check .      # Lint
docker compose exec backend ruff format .     # Format
docker compose exec backend python manage.py makemigrations
docker compose exec backend python manage.py migrate

# Frontend (depuis apps/frontend)
npm run dev      # Dev server
npm run test     # Vitest
npm run lint     # ESLint
npm run build    # Build de prod

# Stack complète
docker compose up -d
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
- Composants : un composant par fichier, nom du fichier = nom du composant.
- État serveur : **TanStack Query** uniquement (jamais `useEffect` + `fetch` à la main).
- Formulaires : **React Hook Form + Zod**. Le schéma Zod sert aussi de type TS via `z.infer<>`.
- UI : composants shadcn/ui en priorité avant d'en créer un. Tailwind utility-first, pas de CSS custom sauf cas exceptionnel.

## Architecture rules — universelles

- **Avant d'écrire du code, lire** : si un fichier proche fait une chose similaire, suivre son pattern. Cohérence > élégance.
- **Factoriser après duplication, pas avant** : règle du "rule of three". Deux fois c'est OK, trois fois → extraire.
- **Une seule abstraction à la fois** : pas de wrapper d'un wrapper. Si on n'utilise une abstraction qu'à un seul endroit, c'est probablement prématuré.
- Pas de fonction qui dépasse ~50 lignes. Pas de classe qui dépasse ~300 lignes. Si ça dépasse, signaler avant de continuer.
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

## Workflow

- Quand une tâche est ambiguë, **poser une question** avant de coder. Ne pas inventer.
- Pour les modèles ou endpoints, vérifier le schéma dans `docs/schema_base_donnees.md` avant.
- Toute nouvelle fonctionnalité doit pouvoir se rattacher à un URS (URS-XXX). Si rien ne couvre, le signaler.
- Après modification du modèle Django : générer la migration et la mentionner explicitement.
- À la fin d'une tâche, indiquer la ligne du `docs/plan_avancement.md` à cocher.
- **À chaque création ou modification d'endpoint** : utiliser les outils MCP Postman pour ajouter ou mettre à jour l'endpoint dans le workspace en ligne. Un dossier Postman = une app Django. Chaque requête doit inclure : une description courte, les headers nécessaires, un body d'exemple réaliste, et un script de test qui stocke les IDs retournés dans les variables d'environnement (ex: `pm.environment.set('product_id', json.id)`). Pour les méthodes POST/PUT/PATCH, ajouter les variables correspondantes à l'environnement `mizan-local`.
- **Pour synchroniser Postman** après une session de développement, envoyer dans la session Postman dédiée : `"Scanne les urls.py du backend et mets à jour la collection Mizan dans Postman"`
- **À chaque nouvelle app Django** : créer `apps/backend/apps/<app>/factories.py` avec des factories `factory_boy` + `faker` pour tous les modèles de l'app. Ajouter le seeding correspondant dans `apps/core/management/commands/seed_data.py`. Tester avec : `docker compose exec backend python manage.py seed_data`.

## Self-check before responding

Avant de produire la réponse finale, relire mentalement :
1. Le code respecte-t-il la séparation views / services / models ?
2. Y a-t-il un secret, une donnée sensible, ou une fuite de données entre boutiques ?
3. Est-ce que je duplique du code qui existe déjà ailleurs dans le repo ?
4. Le typage est-il complet (Python type hints, TS strict sans `any`) ?
5. Si j'ai fait un choix non évident, l'ai-je expliqué en une phrase ?

Si l'un des points pose problème, corriger avant de répondre.
