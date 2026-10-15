# Lot 6 — recette des factures clients (15 octobre 2026)

Références validées : `docs/maquettes/facture-couleur.html`, `facture-neutre.html` et `parametres-factures.html`.

- `facture-couleur.pdf` et `.png` : A4 couleur terre cuite, facture partiellement payée et compte client.
- `facture-neutre.pdf` et `.png` : même composition en noir et gris.
- `facture-3-pages.pdf` et `.png` : 50 lignes, première page convertie, en-tête du tableau répété et pied « Page X sur Y » sur chaque page.

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

Le PDF utilise seulement l’instantané à l’émission. Le statut et le montant payé suivent les évolutions autorisées du règlement ; les coordonnées, mentions, couleurs, logo, langue, commande et récapitulatif restent figés. Le récapitulatif déduit les règlements des anciennes factures de leur solde dû, puis ceux de la présente facture une seule fois. Les PDF en arabe restent une dette du plan : rendu français pour ces comptes.
