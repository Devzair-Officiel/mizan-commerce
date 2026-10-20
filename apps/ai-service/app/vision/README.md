# Fournisseurs de vision — secours du scan d'emballage

Appelés par `POST /internal/product-scan/vision`, seulement quand Django le
décide (nom incertain après code-barres, Open Food Facts et OCR local, et
quota mensuel de la boutique disponible). L'image reçue par un fournisseur est
toujours réduite (côté long ≤ 1600 px), ré-encodée en JPEG et sans métadonnées
(`image_prep.prepare_for_provider`).

## Variables d'environnement

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `VISION_PROVIDER` | `none` | `openai`, ou `none` pour désactiver le secours |
| `VISION_MODEL` | `OPENAI_INVOICE_MODEL` | Modèle du fournisseur |
| `VISION_TIMEOUT_SECONDS` | `30` | Délai maximal d'un appel |

`none`, une valeur inconnue ou une clé absente désactivent le secours : le scan
renvoie la lecture locale, jamais une erreur bloquante (`vision_available`
vaut `false`, Django n'appelle pas le secours et ne consomme aucun quota).

## Ajouter un fournisseur (3 étapes)

1. **Un fichier** `vision/<nom>_provider.py` : une classe dont la méthode
   `extract(image: bytes, mime_type: str) -> ProductVisionResult` respecte le
   `Protocol` `ProductVisionProvider` (`base.py`), plus une fabrique
   `from_config()` qui renvoie `None` si la clé manque. Utiliser
   `PRODUCT_VISION_SYSTEM_PROMPT` (ne pas le recopier), lever
   `VisionProviderError` sur tout échec, et journaliser par appel le
   fournisseur, le modèle, la durée et l'usage en tokens — jamais l'image, le
   texte lu ni la réponse brute.
2. **Une ligne** dans `_FACTORIES` de `registry.py` : `'<nom>': <nom>_provider.from_config`.
3. **Des variables d'environnement** : la clé du fournisseur dans `config.py`
   (lue par `os.environ`, sans défaut), ajoutée à `deploy/app/compose.yml`, à
   `.env.example` et aux deux `deploy/env/*.env.example` avec une valeur vide.
   Puis `VISION_PROVIDER=<nom>`.

Avant de passer `VISION_PROVIDER` hors de `none` en production : revoir la
politique de confidentialité (case bloquante de la checklist de lancement,
`docs/plan_avancement.md`).
