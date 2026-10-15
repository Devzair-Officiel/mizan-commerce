# Pages Factures — gabarits §9 et §10

Référence : `docs/design_principles.md`, composants partagés des pages Commandes. Émission depuis une commande ; liste et détail des documents émis en lecture seule.

- Liste : indicateurs cliquables, recherche sur numéro et nom complet figé du client, menus Statut et Paiement comptés, six colonnes triables et pagination de 20 lignes. Recherche, filtres, tri et page dans l’URL ; départage stable par date et identifiant.
- Mobile : indicateurs en deux colonnes, recherche, feuille de filtres en brouillon avec validation et compteur, groupes par date d’émission, chargement des pages suivantes.
- Détail : en-tête avec retour, numéro et statut, PDF en action principale, menu secondaire desktop/feuille mobile ; annulation confirmée, paiement manuel seulement sans commande liée. Deux colonnes et pile mobile réordonnée ; lignes, totaux, règlement reçu, reste à payer et récapitulatif figé, vendeur, client, commande et aperçu.
- Logo : URL privée signée obtenue depuis la référence de l’instantané. Coordonnées, couleur, devise et compte restent ceux de l’émission, même après changement des réglages. Les montants utilisent le formateur commun de l’application (symbole de devise), les dates le fuseau de la boutique pour les instants.

API : `GET /api/invoices/summary/` fournit montant et nombre à encaisser, nombre et montant émis/payés ce mois-ci. Émises : date d’émission, tous statuts ; payées : statut payé et date de règlement. Mois calculés dans le fuseau de la boutique. `GET /api/invoices/facets/` applique tous les filtres et la recherche, sauf le filtre du menu compté. Liste : `search`, `status`, `payment=due|unpaid|partial|paid`, `period=issued_month|paid_month`, `ordering`, `page`. Les trois endpoints restent limités à la boutique et au module Factures.

Vérifications rapides : `pytest apps/invoices -n auto` (134 tests), `ruff check .`, lint, typecheck et contrôles npm i18n/tokens/text/deps. Audit :

```bash
docker compose run --rm e2e npm run audit -- invoices
```

Le smoke couvre desktop français clair et mobile arabe sombre, tri et pagination serveur, recherche, indicateurs, nombres des filtres, brouillon mobile, données figées après changement des réglages, logo, téléchargement PDF, annulation et conservation des montants. Captures dans `apps/frontend/e2e/results/invoices-*.png`, résultats dans `invoices.log`. Console et éléments interactifs imbriqués surveillés. ESLint conserve sept avertissements préexistants.
