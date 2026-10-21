# Fournisseurs IA du scan d'emballage

Un fournisseur sert à deux niveaux. Chacun se désactive séparément.

1. **Structuration du texte** (`structure`). `POST /internal/product-scan`
   lui envoie toutes les lignes OCR de la face, et du dos s'il est fourni :
   texte, position, hauteur et côté. Il n'envoie **aucune image**. Le
   fournisseur renvoie la marque, la désignation, la variante, les
   allégations, la contenance et le code-barres. `product_reading.py`
   assainit cette réponse, puis écarte toute valeur absente du texte lu.
   Sans fournisseur, ou s'il échoue, les règles de `product_text.py`
   prennent le relais.

   Django décide de chaque appel : il envoie le champ `structure=true`
   seulement s'il a réservé une « lecture avancée » sur le plafond mensuel de
   la boutique (`max_text_scans_per_month`, face et dos d'un même scan = une
   place). Sans ce champ, ou avec `false` (plafond atteint), le modèle n'est
   pas appelé : `structuring` vaut `skipped` et seules les règles lisent le
   texte. Django rembourse la place si `structuring` n'est pas `done`.
2. **Secours image** (`extract`). `POST /internal/product-scan/vision`
   n'est appelé que si Django le décide. Il faut à la fois :
   - une lecture insuffisante (critère sémantique `needs_vision`, ou
     confiance trop basse) ;
   - un quota mensuel disponible pour la boutique ;
   - `PRODUCT_SCAN_IMAGE_FALLBACK` vrai.

   Seule la photo de face part. Elle est toujours réduite (côté long ≤ 1600 px),
   ré-encodée en JPEG et débarrassée de ses métadonnées
   (`image_prep.prepare_for_provider`).

Aucune donnée de la boutique n'arrive jusqu'ici : le nom proposé est composé
par Django.

## Variables d'environnement

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `VISION_PROVIDER` | `none` | `openai`, ou `none` pour ne rien envoyer (ni texte, ni image) |
| `PRODUCT_TEXT_MODEL` | `OPENAI_INVOICE_MODEL` | Modèle de la structuration du texte |
| `PRODUCT_TEXT_TIMEOUT_SECONDS` | `15` | Délai maximal de la structuration |
| `PRODUCT_SCAN_IMAGE_FALLBACK` | `false` | `true` pour autoriser l'envoi de la photo en secours |
| `VISION_MODEL` | `OPENAI_INVOICE_MODEL` | Modèle du secours image |
| `VISION_TIMEOUT_SECONDS` | `30` | Délai maximal du secours image |

`none`, une valeur inconnue ou une clé absente désactivent les deux niveaux.
Le scan renvoie alors la lecture par règles, jamais une erreur bloquante :
`structuring` vaut `disabled` et `vision_available` vaut `false`. Avec un
fournisseur mais `PRODUCT_SCAN_IMAGE_FALLBACK=false`, seul le texte part :
`vision_available` vaut `false`, Django n'appelle pas le secours et ne consomme
aucun quota.

## Ajouter un fournisseur (3 étapes)

1. **Un fichier** `vision/<nom>_provider.py`. Il contient deux choses :
   - une classe qui respecte le `Protocol` `ProductVisionProvider` (`base.py`),
     avec deux méthodes : `structure(lines)` et `extract(image, mime_type)`,
     qui renvoient toutes deux un `ProductReading` ;
   - une fabrique `from_config()`, qui renvoie `None` si la clé manque.

   Règles à suivre dans ce fichier :
   - utiliser `PRODUCT_TEXT_SYSTEM_PROMPT`, `PRODUCT_VISION_SYSTEM_PROMPT` et
     `format_scan_lines` sans les recopier ;
   - ne demander aucune conservation côté fournisseur ;
   - lever `VisionProviderError` sur tout échec ;
   - journaliser à chaque appel le fournisseur, le modèle, la durée et l'usage
     en tokens, jamais l'image, le texte lu ni la réponse brute.
2. **Une ligne** dans `_FACTORIES` de `registry.py` : `'<nom>': <nom>_provider.from_config`.
3. **Des variables d'environnement.** La clé du fournisseur va dans
   `config.py`, lue par `os.environ`, sans valeur par défaut. Ajoutez-la à
   `deploy/app/compose.yml`, à `.env.example` et aux deux
   `deploy/env/*.env.example` avec une valeur vide. Puis réglez
   `VISION_PROVIDER=<nom>`.

Vérifiez la qualité avec `scripts/eval_product_scan.py --providers rules,<nom>`.
Le mode d'emploi est dans `tests/fixtures/product_scan/README.md`.

Avant de passer `VISION_PROVIDER` hors de `none` en production, revoyez la
politique de confidentialité, et de même avant d'activer
`PRODUCT_SCAN_IMAGE_FALLBACK`. C'est la case bloquante de la checklist de
lancement, dans `docs/plan_avancement.md`.
