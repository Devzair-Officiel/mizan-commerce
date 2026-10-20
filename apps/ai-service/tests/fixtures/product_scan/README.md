# Jeu d'étalon du scan d'emballage

Un fichier JSON par emballage. Il donne ce qu'on attend du scan, et il sert à
`scripts/eval_product_scan.py`, qui affiche un score par champ et par
fournisseur.

**Ne commitez aucune photo d'emballage.** Ce sont des images tierces : marques,
visuels et étiquettes. Le dossier `images/` est ignoré par Git. Seuls les JSON
y sont commités, avec le texte relevé et les valeurs attendues.

## Ajouter un emballage

1. Copiez la photo de face (et, si vous l'avez, celle du dos) dans `images/`,
   par exemple `images/the-vert.jpg` et `images/the-vert-dos.jpg`.
2. Créez `the-vert.json` à côté de ce README :

   ```json
   {
     "description": "Boîte de thé vert, face et dos.",
     "image": "the-vert.jpg",
     "image_back": "the-vert-dos.jpg",
     "expected": {
       "brand": "Marque lue sur la face",
       "product_name": "Thé vert à la menthe",
       "variant": null,
       "net_quantity": "100 g"
     }
   }
   ```

   `expected` contient ce que vous saisiriez vous-même dans la fiche article.
   `product_name` est la désignation, sans la marque, la variante ni la
   contenance. Mettez `null` pour un champ absent de l'emballage.
3. Lancez l'étalonnage. Sans `ocr_lines`, le script lit la photo avec
   PaddleOCR :

   ```bash
   docker compose exec ai-service python scripts/eval_product_scan.py --providers rules
   docker compose exec ai-service python scripts/eval_product_scan.py --providers rules,openai --details
   ```

   `openai` structure le texte lu : seul le texte part, jamais la photo. Il
   faut que `OPENAI_API_KEY` soit exportée dans le conteneur. Le modèle
   utilisé est `PRODUCT_TEXT_MODEL`.

## Partager un cas sans la photo

Pour rendre un cas reproductible sans photo, ajoutez au JSON un champ
`ocr_lines` : la liste des lignes lues, avec `text`, `confidence`, `bbox`
(`[x0, y0, x1, y1]`) et `side` (`face` ou `back`). `ziyada.json` en est un
exemple. Le script se sert alors de ces lignes, sauf si vous passez `--reocr`
et que la photo est présente.

Ces lignes reprennent le texte de l'emballage. Relisez-les avant de les
commiter : rien de personnel, rien qui ne soit imprimé sur le produit. Même
consigne pour la sortie de `--details`.
