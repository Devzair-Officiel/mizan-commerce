"""Contrôle, décodage et préparation d'une image (Pillow).

Trois usages :
- `check_image` : dimensions et intégrité d'une photo de facture, avant
  PaddleOCR (qui la décode sans aucune limite) ;
- `open_image` : image prête pour le décodage du code-barres, orientée selon
  l'EXIF (une photo de téléphone est souvent stockée couchée) ;
- `prepare_for_provider` : copie réduite (côté long ≤ 1600 px), ré-encodée en
  JPEG sans aucune métadonnée — c'est la seule forme sous laquelle une image
  peut partir chez un fournisseur de vision (la position GPS de l'EXIF trahirait
  l'adresse de la boutique).

Pillow est déjà installé par PaddleOCR ; il est épinglé dans requirements.txt
parce que le code l'utilise directement.
"""
from __future__ import annotations

import io
import warnings

from PIL import Image, ImageOps, UnidentifiedImageError

# Côté long maximal envoyé au fournisseur : assez pour lire un texte
# d'emballage, sans payer des tuiles d'image inutiles.
PROVIDER_MAX_SIDE_PX: int = 1600
PROVIDER_JPEG_QUALITY: int = 85

# Garde contre les « bombes de décompression » : un PNG de quelques Ko peut
# annoncer 100 000 × 100 000 px. 50 Mpx : le mode pleine résolution des
# capteurs de téléphone de 50 Mpx passe. Même plafond côté backend
# (`apps/backend/apps/core/images.py`).
MAX_PIXELS: int = 50_000_000

# Pillow avertit au-delà de son plafond et ne refuse qu'au-delà du double :
# l'avertissement devient une erreur, pour tout le processus.
Image.MAX_IMAGE_PIXELS = MAX_PIXELS
warnings.simplefilter('error', Image.DecompressionBombWarning)

_TOO_LARGE = f'Image trop grande ({MAX_PIXELS // 1_000_000} millions de pixels au maximum).'


class ImageDecodeError(ValueError):
    """Image illisible ou démesurée — l'endpoint répond 400 générique."""


def _open_checked(content: bytes) -> Image.Image:
    """En-tête lu, dimensions contrôlées ; aucun pixel décodé."""
    image = Image.open(io.BytesIO(content))
    if image.width * image.height > MAX_PIXELS:
        raise ImageDecodeError(_TOO_LARGE)
    return image


def check_image(content: bytes) -> None:
    """Dimensions et intégrité, sans décoder les pixels ; `ImageDecodeError` sinon.

    `verify()` relit le fichier entier : un PNG ou un WebP tronqué est refusé.
    """
    try:
        with _open_checked(content) as image:
            image.verify()
    except (Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise ImageDecodeError(_TOO_LARGE) from exc
    except (UnidentifiedImageError, OSError, SyntaxError) as exc:
        raise ImageDecodeError('Image illisible.') from exc


def open_image(content: bytes) -> Image.Image:
    """Décode l'image, applique l'orientation EXIF et la convertit en RGB."""
    try:
        image = _open_checked(content)
        image.load()
    except (Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise ImageDecodeError(_TOO_LARGE) from exc
    except (UnidentifiedImageError, OSError) as exc:
        raise ImageDecodeError('Image illisible.') from exc
    return ImageOps.exif_transpose(image).convert('RGB')


def prepare_for_provider(image: Image.Image) -> bytes:
    """JPEG réduit, sans EXIF ni autre métadonnée, prêt pour le fournisseur.

    Une image neuve est recopiée pixel par pixel : `save` ne reçoit ni `exif`
    ni `icc_profile`, et la copie n'hérite d'aucun bloc `info` de l'original.
    """
    resized = image.copy()
    resized.thumbnail((PROVIDER_MAX_SIDE_PX, PROVIDER_MAX_SIDE_PX), Image.Resampling.LANCZOS)
    clean = Image.new('RGB', resized.size)
    clean.paste(resized)
    buffer = io.BytesIO()
    clean.save(buffer, format='JPEG', quality=PROVIDER_JPEG_QUALITY, optimize=True)
    return buffer.getvalue()
