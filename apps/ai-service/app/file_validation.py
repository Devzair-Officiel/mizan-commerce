"""Validation locale du fichier uploadé pour l'endpoint OCR.

Le service Django applique déjà sa propre validation à l'upload initial
(`OCR_DOCUMENT_ALLOWED_TYPES`, `OCR_DOCUMENT_MAX_SIZE_MB`). Ce module
duplique volontairement la vérification côté ai-service : les deux services
sont indépendants et rien ne garantit que le fichier arrivant ici a été
préalablement contrôlé. Défense en profondeur.

Trois vérifications :
1. taille non nulle et sous la borne max ;
2. `content_type` déclaré parmi la liste blanche ;
3. signature binaire (« magic bytes ») cohérente avec le `content_type`.

Le troisième point est le plus important : le `content_type` d'un upload est
attaquable, la signature ne l'est pas (elle exige un fichier réellement
formé). On refuse toute divergence entre les deux.
"""
from __future__ import annotations

from dataclasses import dataclass

# Cohérence avec `settings.OCR_DOCUMENT_MAX_SIZE_MB` côté backend Django.
# Duplication assumée : les services sont séparés, pas de source unique.
MAX_FILE_SIZE_BYTES: int = 10 * 1024 * 1024

ALLOWED_MIME_TYPES: frozenset[str] = frozenset({
    'image/jpeg',
    'image/png',
    'image/webp',
})


class FileValidationError(ValueError):
    """Erreur de validation d'un fichier uploadé.

    Distincte de `ValueError` générique pour que l'endpoint puisse la
    convertir en 400 sans capturer accidentellement d'autres erreurs.
    """


@dataclass(frozen=True)
class _Signature:
    """Signature binaire attendue en tête de fichier.

    `offset` permet de gérer WebP où la magic `WEBP` apparaît après le
    conteneur RIFF (voir RFC 2361 / spec Google).
    """

    magic: bytes
    offset: int = 0


# Deux JPEG magic bytes suffisent : `FF D8 FF` couvre JFIF, EXIF, SPIFF…
_JPEG_MAGIC = _Signature(magic=b'\xff\xd8\xff')
_PNG_MAGIC = _Signature(magic=b'\x89PNG\r\n\x1a\n')
# WebP : `RIFF....WEBP` — on vérifie RIFF au début et WEBP à l'offset 8.
_WEBP_MAGIC_RIFF = _Signature(magic=b'RIFF')
_WEBP_MAGIC_WEBP = _Signature(magic=b'WEBP', offset=8)


def _matches(header: bytes, sig: _Signature) -> bool:
    end = sig.offset + len(sig.magic)
    return len(header) >= end and header[sig.offset:end] == sig.magic


def _signature_matches_mime(header: bytes, mime_type: str) -> bool:
    if mime_type == 'image/jpeg':
        return _matches(header, _JPEG_MAGIC)
    if mime_type == 'image/png':
        return _matches(header, _PNG_MAGIC)
    if mime_type == 'image/webp':
        return _matches(header, _WEBP_MAGIC_RIFF) and _matches(header, _WEBP_MAGIC_WEBP)
    return False


def validate_uploaded_document(
    *,
    content: bytes,
    content_type: str | None,
) -> None:
    """Valide un document uploadé destiné à l'endpoint OCR.

    Lève `FileValidationError` avec un message court et générique en cas
    d'échec. Le message est visible côté client (Django/Celery) : il ne
    doit contenir aucune donnée technique ou secret.
    """
    if not content:
        raise FileValidationError('Fichier vide.')
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise FileValidationError(
            f'Fichier trop volumineux (max {MAX_FILE_SIZE_BYTES // (1024 * 1024)} Mo).'
        )
    if content_type not in ALLOWED_MIME_TYPES:
        raise FileValidationError('Type de fichier non autorisé.')
    if not _signature_matches_mime(content[:16], content_type):
        raise FileValidationError('Signature de fichier incohérente avec le type déclaré.')
