"""Logique métier OCR.

Cette étape ne fait qu'ingérer une photo de facture fournisseur :
- validation légère de la signature binaire du fichier ;
- upload dans l'Object Storage privé ;
- création d'un `UploadedDocument` + d'un `OcrResult` (status=pending).

Aucun appel OCR / IA n'est déclenché ici — c'est l'objet des étapes suivantes.
"""
from __future__ import annotations

import logging
import uuid
from typing import TYPE_CHECKING, NamedTuple

from django.db import transaction

from apps.core.storage import delete_object, upload_fileobj

from .models import OcrResult, UploadedDocument

if TYPE_CHECKING:
    from django.core.files.uploadedfile import UploadedFile

    from apps.accounts.models import User
    from apps.shops.models import Shop


logger = logging.getLogger(__name__)


__all__ = (
    'create_supplier_invoice_upload',
    'validate_file_signature',
    'InvalidFileSignatureError',
    'SupplierInvoiceUpload',
)


class InvalidFileSignatureError(ValueError):
    """Le binaire du fichier ne correspond pas au MIME annoncé.

    Exception domaine — laisse le service indépendant de DRF. Le serializer
    l'attrape et la convertit en `serializers.ValidationError`.
    """


# Mapping MIME → extension utilisée pour construire l'object_key. On refuse
# de dériver l'extension du filename utilisateur (potentiellement mensonger).
_MIME_TO_EXTENSION: dict[str, str] = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
}


class SupplierInvoiceUpload(NamedTuple):
    document: UploadedDocument
    ocr_result: OcrResult


def validate_file_signature(file: 'UploadedFile', declared_mime: str) -> None:
    """Vérifie que les premiers octets correspondent au MIME annoncé.

    Le `content_type` d'un `UploadedFile` provient de l'en-tête HTTP fourni
    par le client — donc trivialement forgeable. On lit ici la « magic
    number » du fichier pour détecter un binaire qui ne correspond pas à
    l'image annoncée. Implémentation volontairement minimaliste : pas de
    dépendance externe (python-magic, filetype…), on couvre uniquement les
    trois formats acceptés à cette étape.
    """
    # 12 octets suffisent pour distinguer JPEG / PNG / WebP.
    file.seek(0)
    header = file.read(12)
    file.seek(0)

    if declared_mime == 'image/jpeg':
        ok = header.startswith(b'\xff\xd8\xff')
    elif declared_mime == 'image/png':
        ok = header.startswith(b'\x89PNG\r\n\x1a\n')
    elif declared_mime == 'image/webp':
        ok = header[:4] == b'RIFF' and header[8:12] == b'WEBP'
    else:
        ok = False

    if not ok:
        raise InvalidFileSignatureError(
            'Le contenu du fichier ne correspond pas au type déclaré.'
        )


def create_supplier_invoice_upload(
    *,
    shop: 'Shop',
    user: 'User',
    file: 'UploadedFile',
) -> SupplierInvoiceUpload:
    """Ingère une photo de facture fournisseur.

    Contrat :
    - `shop` provient de `get_shop(request.user)` — jamais du client.
    - `file` a déjà été validé côté serializer (présence, taille, MIME).
    - le `OcrResult` créé partage strictement le même `shop` que le document.

    En cas d'échec DB après l'upload S3, l'objet distant est supprimé pour
    éviter les fichiers orphelins (pas de transaction distribuée, simple
    compensation manuelle).
    """
    extension = _MIME_TO_EXTENSION[file.content_type]
    object_key = f'ocr/{shop.pk}/supplier-invoices/{uuid.uuid4()}.{extension}'

    # Sécurité : re-vérifie la signature juste avant l'upload — on ne veut
    # pas se retrouver à uploader un binaire arbitraire même si le serializer
    # a été court-circuité par un usage direct du service.
    validate_file_signature(file, file.content_type)

    upload_fileobj(file, object_key, file.content_type)

    try:
        with transaction.atomic():
            document = UploadedDocument.objects.create(
                shop=shop,
                uploaded_by_user=user,
                document_type=UploadedDocument.DOCUMENT_TYPE_SUPPLIER_INVOICE,
                object_key=object_key,
                original_filename=(file.name or '')[:255],
                mime_type=file.content_type,
                size_bytes=file.size,
            )
            ocr_result = OcrResult.objects.create(
                shop=shop,
                uploaded_document=document,
                status=OcrResult.STATUS_PENDING,
            )
    except Exception:
        # Compensation : le fichier est déjà distant, on le retire pour
        # ne pas laisser d'orphelin. `delete_object` log mais ne relève pas.
        logger.exception(
            "Échec DB après upload OCR — nettoyage de l'objet %s", object_key,
        )
        delete_object(object_key)
        raise

    return SupplierInvoiceUpload(document=document, ocr_result=ocr_result)
