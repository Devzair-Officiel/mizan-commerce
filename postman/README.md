# Collection Postman

- `mizan-commerce.postman_collection.json` : l'API, un dossier par app Django.
- `mizan-local.postman_environment.json` : l'environnement `mizan-local` (backend sur `http://localhost:8000`).
- `fixtures/` : images envoyées par les requêtes multipart (photo d'article, facture fournisseur).

## Importer

1. Dans Postman : **Import**, puis choisir les deux fichiers JSON.
2. Sélectionner l'environnement **Mizan — Local**.
3. Renseigner `login_password` : le mot de passe des comptes de démonstration créés par `seed_data`. C'est une variable secrète et vide dans le fichier versionné : ne jamais la sauvegarder dans ce fichier.
4. Pour les requêtes multipart, autoriser Postman à lire le dossier `postman/` (**Settings › General › Working directory**). Les chemins `fixtures/…` sont relatifs à ce dossier.

Les jetons (`access_token`, `refresh_token`, `pro_access_token`) et les identifiants (`product_id`, `order_id`…) sont rangés par les scripts de test au fil des requêtes. Ils restent des valeurs courantes de votre Postman : ne pas les exporter dans le fichier versionné.

## Ordre d'exécution

- Commencer par **Authentification › Inscription**. Cette requête crée un compte d'essai neuf, avec Boutique+. Elle range ses jetons et bascule `login_email` sur ce compte. **Connexion** fonctionne aussi, sur `login_email` (par défaut `youssef@example.com`).
- Les requêtes qui écrivent modifient la boutique du compte connecté. Lancer **Inscription** d'abord évite d'abîmer les données de démonstration.
- Lancer ensuite **Connexion — compte sans Boutique+** : elle range `pro_access_token`, dont ont besoin les requêtes « 403 sans Boutique+ ».
- Suivre ensuite les dossiers dans l'ordre. Chaque requête utilise les identifiants rangés par les précédentes : article avant stock, client avant commande, commande avant facture.
- Deux dépendances sortent de cet ordre :
  - les cartes de fidélité ne sont créées par aucune API (première commande dans l'application, ou `seed_data`) ;
  - **Valider la lecture (OCR)** attend que la lecture soit terminée : environ 10 s après l'envoi, statut `done`.
- **Abonnement › Résilier — passer en Gratuit** est destructif : la boutique perd ses fonctions payantes et ses employés sont suspendus. Ne l'utiliser que sur un compte de test, en dernier.
- Connexion, inscription, rafraîchissement et réinitialisation sont limités à 10 appels par minute.

## Lancer les tests avec Newman

Node n'est pas installé sur la machine : Newman tourne dans le conteneur `frontend`, sans être ajouté au `package.json`. Les commandes ci-dessous sont à lancer depuis la racine du dépôt.

```bash
docker compose exec -T frontend mkdir -p /tmp/postman-run
docker compose cp postman/. frontend:/tmp/postman-run/
docker compose exec -T frontend sh -c 'cd /tmp/postman-run && npx -y newman@6.2.3 run mizan-commerce.postman_collection.json \
  -e mizan-local.postman_environment.json --working-dir /tmp/postman-run \
  --env-var base_url=http://backend:8000 --env-var "login_password=<mot de passe du seed>" \
  --folder Authentification --folder Boutique --folder Articles'
```

- Depuis le conteneur, le backend se joint par `http://backend:8000`.
- `--folder` limite l'exécution à certains dossiers. Sans cette option, la collection entière tourne dans l'ordre du fichier.
- L'ordre du fichier suit les apps, pas les dépendances. Pour une exécution complète sans erreur, lancer d'abord une requête de création, puis les requêtes qui en dépendent. Exemple : Formats et Photos après « Créer un article avec ses formats ».
- `--export-environment env-out.json` garde les identifiants pour une exécution suivante.
