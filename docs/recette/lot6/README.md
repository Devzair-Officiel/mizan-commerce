# Lot 6 — recette des factures clients (15 octobre 2026)

Références validées : `docs/maquettes/facture-couleur.html`, `facture-neutre.html` et `parametres-factures.html`.

- `facture-couleur.pdf` et `.png` : A4 couleur terre cuite, facture partiellement payée et compte client.
- `facture-neutre.pdf` et `.png` : même composition en noir et gris.
- `facture-3-pages.pdf` : 50 lignes ; les trois pages sont exportées dans `facture-3-pages-p1.png`, `facture-3-pages-p2.png` et `facture-3-pages-p3.png`. `facture-3-pages.png` conserve la première page pour compatibilité.

Les PNG sont des conversions PDFium à 96 dpi. Comparaison visuelle avec les maquettes HTML capturées dans Chromium : marges de 48 px, liseré de 8 px, titre de 30 px, couleurs `#9c4f2c` et `#2b2f2d`, blocs teintés et totaux alignés. Ajustement des marges internes de ReportLab, des interlignes, des angles et de l’alignement du badge. Police libre DejaVu Sans embarquée (licence dans `apps/backend/apps/invoices/fonts/LICENSE.txt`), avec accents français. Les coordonnées et montants sont fictifs.

Régénération sans écriture en base ni consommation de numéro :

```bash
docker compose exec -T backend python manage.py preview_invoices
cp apps/backend/artifacts/lot6/* docs/recette/lot6/
```

Audit du formulaire :

```bash
docker compose run --rm e2e npm run audit -- invoice-settings
```

Captures desktop/mobile : `apps/frontend/e2e/results/invoice-settings-*.png` ; détail : `apps/frontend/e2e/results/invoice-settings.log`. L’audit vérifie les trois modes, l’assombrissement, l’enregistrement, la TVA, les coordonnées bancaires conditionnelles, les options au clavier, le téléchargement PDF, la persistance, la disposition et la console.

## Finitions et recette rapide

- SIRET, IBAN et TVA regroupés à l’affichage ; téléphones internationaux lisibles dans le PDF et le détail. Les champs des réglages acceptent les espaces et les valeurs enregistrées restent compactes. SIRET de 14 chiffres et clé IBAN contrôlés côté formulaire et API, avec erreurs sous les champs.
- Les trois pages PNG ont été examinées : en-tête du tableau répété, lignes entières, totaux avec reste à payer, récapitulatif avec son titre, règlement et mentions indivisibles, pied et « Page X sur Y » sur chaque page. Les exemples courts restent sur une page.
- Tests automatiques : PDF long de 3 pages, pied et numérotation sur chacune, lignes hautes et blocs financiers entiers à plusieurs positions de saut de page, formatage sans mutation de l’instantané, validation des identifiants et seed idempotent.
- Backend : **238 tests réussis** (`apps/invoices`, `apps/core`, `apps/shops`) et `ruff check .` conforme. Frontend : typecheck, lint et contrôles i18n/tokens/text/deps conformes (7 avertissements ESLint préexistants).
- Audit smoke Paramètres › Factures : **conforme**, desktop français clair et mobile arabe sombre. Il couvre aussi les erreurs SIRET/IBAN, le formatage après rechargement et dans le détail, et la conservation des valeurs de l’instantané.
- Le seed génère un logo PNG original de 128 × 128 px, sans marque ni ressource externe (CC0). Stockage privé et logo partagé avec la page publique ; les logos déjà présents sont conservés. Avec le stockage configuré, la couleur automatique extraite est `#b35e30`. Vérification navigateur sur Youssef : logo chargé, aperçu automatique cohérent, console propre (`apps/frontend/e2e/results/invoice-settings-youssef-logo.png`).

Le PDF utilise seulement l’instantané à l’émission. Le statut et le montant payé suivent les évolutions autorisées du règlement ; les coordonnées, mentions, couleurs, logo, langue, commande et récapitulatif restent figés. Le récapitulatif déduit les règlements des anciennes factures de leur solde dû, puis ceux de la présente facture une seule fois. Les PDF en arabe restent une dette du plan : rendu français pour ces comptes.

## Vérifications initiales du lot 6 (avant finitions)

- Backend : `pytest -n auto` complet, **870 tests réussis** ; `ruff check .` et `makemigrations --check` conformes.
- Migrations créées et appliquées en développement : `shops.0009_shop_invoice_auto_color_shop_invoice_bic_and_more`, `invoices.0006_invoice_presentation_invoiceline_product_name_and_more`.
- Frontend : typecheck, lint et contrôles i18n/tokens/text/deps réussis ; ESLint conserve ses 7 avertissements préexistants, sans nouvelle erreur.
- Build de production réussi après redémarrage du frontend.
- Suite navigateur complète : **25 audits smoke conformes**, dont Paramètres › Factures, en 345 secondes. Console surveillée par les audits.
