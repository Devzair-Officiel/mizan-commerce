"""Contrôle d'une image envoyée (photo d'article, logo, couverture, facture, scan).

Avant tout stockage ou envoi au service IA, l'image est ouverte par Pillow :
- format réel conforme au type déclaré (un PNG renommé en .jpg est refusé) ;
- dimensions bornées, lues dans l'en-tête avant tout décodage : un PNG de
  quelques Ko peut annoncer 12 000 × 12 000 px (« bombe de décompression ») ;
- fichier complet : un fichier tronqué est refusé.

Le plafond de Pillow (`Image.MAX_IMAGE_PIXELS`) est fixé ici pour tout le
processus, avertissement compris : au-delà, Pillow lève
`DecompressionBombWarning` (en erreur, voir plus bas), même pour une image
ouverte ailleurs (rendu du logo d'une facture). Module importé par
`CoreConfig.ready()`.

Le service IA applique le même plafond (`apps/ai-service/app/image_prep.py`).
"""

from __future__ import annotations

import warnings
from io import BytesIO
from typing import TYPE_CHECKING

from PIL import Image, UnidentifiedImageError
from rest_framework.exceptions import ValidationError

if TYPE_CHECKING:
    from django.core.files.uploadedfile import UploadedFile

__all__ = (
    'IMAGE_EXTENSIONS',
    'IMAGE_TOO_LARGE',
    'IMAGE_UNREADABLE',
    'MAX_IMAGE_PIXELS',
    'InvalidImageError',
    'validate_uploaded_image',
    'verify_image',
)

# Le mode pleine résolution des capteurs de téléphone de 50 Mpx (8160 × 6120)
# passe ; au-delà, l'image ne tient de toute façon pas dans 10 Mo.
MAX_IMAGE_PIXELS = 50_000_000

# Pillow avertit au-delà de ce plafond et ne refuse qu'au-delà du double :
# l'avertissement devient une erreur, pour une seule limite.
Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS
warnings.simplefilter('error', Image.DecompressionBombWarning)

_FORMATS = {'image/jpeg': 'JPEG', 'image/png': 'PNG', 'image/webp': 'WEBP'}
# Extension d'un objet stocké : déduite du type vérifié, jamais du nom envoyé.
IMAGE_EXTENSIONS = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp'}

# Codes du refus (`code` de la réponse 400), traduits par le frontend.
IMAGE_TOO_LARGE = 'image_too_large'
IMAGE_UNREADABLE = 'image_unreadable'

_UNREADABLE_MESSAGE = (
    'Cette image est illisible, incomplète ou ne correspond pas à son format. '
    'Enregistrez-la à nouveau, ou prenez une autre photo.'
)


class InvalidImageError(Exception):
    """Image refusée — le message est destiné au commerçant (aucun détail technique)."""

    def __init__(self, message: str, code: str) -> None:
        super().__init__(message)
        self.code = code


def _too_large(max_pixels: int) -> InvalidImageError:
    return InvalidImageError(
        f'Cette image est trop grande ({max_pixels // 1_000_000} millions de pixels '
        'au maximum). Réduisez sa taille, puis envoyez-la à nouveau.',
        IMAGE_TOO_LARGE,
    )


def verify_image(
    content: bytes, content_type: str, *, max_pixels: int = MAX_IMAGE_PIXELS,
) -> None:
    """Format, dimensions et intégrité ; `InvalidImageError` si l'image est refusée.

    `verify()` relit tout le fichier sans décoder les pixels (PNG, WebP) ; un
    JPEG tronqué ne se voit qu'au décodage, fait au huitième de la taille
    (`draft`) pour rester léger.
    """
    try:
        with Image.open(BytesIO(content)) as image:
            if image.format != _FORMATS.get(content_type):
                raise InvalidImageError(_UNREADABLE_MESSAGE, IMAGE_UNREADABLE)
            if image.width * image.height > max_pixels:
                raise _too_large(max_pixels)
            image.verify()
        if content_type == 'image/jpeg':
            with Image.open(BytesIO(content)) as image:
                image.draft('RGB', (image.width // 8, image.height // 8))
                image.load()
    except (Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise _too_large(max_pixels) from exc
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError) as exc:
        raise InvalidImageError(_UNREADABLE_MESSAGE, IMAGE_UNREADABLE) from exc


def validate_uploaded_image(file: UploadedFile) -> None:
    """`verify_image` sur un fichier envoyé ; refus : `ValidationError` (400), code."""
    file.seek(0)
    content = file.read()
    file.seek(0)
    try:
        verify_image(content, file.content_type)
    except InvalidImageError as exc:
        raise ValidationError(str(exc), code=exc.code) from exc
