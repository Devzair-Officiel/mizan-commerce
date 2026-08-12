"""Utilitaires de stockage partagés (S3 / OVH Object Storage).

Réutilisable par toute app qui upload des fichiers (logos, images produits,
PDF zakat, factures fournisseurs, etc.).
"""
from __future__ import annotations

import logging

from django.conf import settings

logger = logging.getLogger(__name__)


def _get_s3_client():
    import boto3
    return boto3.client(
        's3',
        endpoint_url=settings.AWS_S3_ENDPOINT_URL,
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name=settings.AWS_S3_REGION_NAME,
    )


def is_storage_configured() -> bool:
    return bool(settings.AWS_S3_ENDPOINT_URL and settings.AWS_ACCESS_KEY_ID)


def upload_fileobj(fileobj, object_key: str, content_type: str) -> str:
    """Upload un fichier vers le bucket privé. Retourne l'object_key."""
    s3 = _get_s3_client()
    s3.upload_fileobj(
        fileobj,
        settings.AWS_STORAGE_BUCKET_NAME,
        object_key,
        ExtraArgs={'ContentType': content_type, 'ACL': 'private'},
    )
    return object_key


def get_signed_url(object_key: str, expires_in: int = 3600) -> str:
    s3 = _get_s3_client()
    return s3.generate_presigned_url(
        'get_object',
        Params={'Bucket': settings.AWS_STORAGE_BUCKET_NAME, 'Key': object_key},
        ExpiresIn=expires_in,
    )


def download_bytes(object_key: str) -> bytes:
    """Télécharge intégralement un objet du bucket privé en mémoire.

    Usage prévu : lecture d'un document uploadé (facture) pour le renvoyer au
    service IA. Pour un POC single-image (< 10 Mo) tenir tout en RAM reste
    largement préférable à un fichier temporaire supplémentaire.

    Relève toute erreur boto3 telle quelle : le caller (tâche Celery) sait
    quoi en faire (log + mark_ocr_failed). On close explicitement le stream
    S3 même en cas d'exception via `try/finally` pour éviter de laisser une
    connexion ouverte sur le pool botocore.
    """
    s3 = _get_s3_client()
    response = s3.get_object(Bucket=settings.AWS_STORAGE_BUCKET_NAME, Key=object_key)
    body = response['Body']
    try:
        return body.read()
    finally:
        body.close()


def delete_object(object_key: str) -> None:
    """Supprime un fichier du bucket. Log l'erreur mais ne lève pas — usage
    typique: cleanup d'un fichier remplacé, où on ne veut pas faire échouer
    l'upload réussi à cause d'un nettoyage qui rate."""
    if not object_key:
        return
    try:
        s3 = _get_s3_client()
        s3.delete_object(Bucket=settings.AWS_STORAGE_BUCKET_NAME, Key=object_key)
    except Exception:
        logger.exception("Échec de la suppression S3 pour la clé %s", object_key)
