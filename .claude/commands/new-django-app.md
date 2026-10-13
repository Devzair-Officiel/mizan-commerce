---
description: Crée une nouvelle app Django avec factories.py et seeding
---

Crée l'app Django `$ARGUMENTS` dans `apps/backend/apps/`, en respectant la structure des apps existantes (models.py, services.py, serializers.py, views.py, urls.py, admin.py, tests.py).
Avant de créer quoi que ce soit, reformule en une phrase ta compréhension du domaine métier de `$ARGUMENTS` et propose une liste de modèles/champs envisagés. Attends ma confirmation avant de créer le moindre fichier.

Ensuite, obligatoirement :
1. Crée `apps/backend/apps/$ARGUMENTS/factories.py` avec des factories `factory_boy` + `faker` pour chaque modèle de l'app.
2. Ajoute le seeding correspondant dans `apps/core/management/commands/seed_data.py`.
3. Lance `docker compose exec backend python manage.py seed_data` pour vérifier que le seeding ne plante pas.
4. Indique la ligne de `docs/plan_avancement.md` à ajouter ou cocher pour cette app, si elle correspond à un URS existant.