# Commandes utiles

## Stack Docker

```bash
# Démarrer tous les services (backend, frontend, postgres, redis)
docker compose up -d

# Arrêter tous les services
docker compose down

# Voir les logs en temps réel
docker compose logs -f backend
```

## Base de données

```bash
# Appliquer les migrations
docker compose exec backend python manage.py migrate

# Générer une migration après modification d'un modèle
docker compose exec backend python manage.py makemigrations

# Insérer des données fictives pour le développement (idempotent)
docker compose exec backend python manage.py seed_data

# Vider la BDD et réinsérer les données fictives
docker compose exec backend python manage.py seed_data --flush
```

## Backend (Django)

```bash
# Lancer tous les tests
docker compose exec backend pytest

# Lancer un test ciblé
docker compose exec backend pytest apps/shops/tests.py::MultiTenantIsolationTest

# Vérifier le style de code
docker compose exec backend ruff check .

# Formater le code
docker compose exec backend ruff format .

# Créer un superuser (admin Django)
docker compose exec -it backend python manage.py createsuperuser

# Ouvrir un shell Django
docker compose exec backend python manage.py shell
```

## Frontend (Next.js)

```bash
# Lancer le serveur de développement (depuis apps/frontend)
npm run dev

# Lancer les tests Vitest
npm run test

# Vérifier le style de code
npm run lint

# Build de production
npm run build
```
