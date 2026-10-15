"""Contrôle d'une facture PDF à l'envoi, avant tout stockage.

La signature (`%PDF-`) est vérifiée par `services.validate_file_signature`.
Ce module ouvre ensuite le document avec PDFium (`pypdfium2`, roue autonome,
sans dépendance système) pour refuser tout de suite, avec un message clair :
- un PDF protégé par mot de passe (illisible pour la lecture) ;
- un PDF illisible ou endommagé ;
- un PDF de plus de `OCR_PDF_MAX_PAGES` pages.

La lecture du texte (ou le rendu des pages scannées) est faite par le
service IA ; il refait les mêmes contrôles (défense en profondeur).

PDFium n'est pas thread-safe : tout accès passe par `_pdfium_lock`.
"""
from __future__ import annotations

import threading
from typing import TYPE_CHECKING

import pypdfium2 as pdfium
import pypdfium2.raw as pdfium_c
from django.conf import settings

if TYPE_CHECKING:
    from django.core.files.uploadedfile import UploadedFile


__all__ = (
    'PDF_PROTECTED',
    'PDF_TOO_MANY_PAGES',
    'PDF_UNREADABLE',
    'InvalidInvoicePdfError',
    'validate_invoice_pdf',
)

# Codes du refus, renvoyés au frontend qui les traduit
# (les messages restent en français).
PDF_PROTECTED = 'pdf_protected'
PDF_TOO_MANY_PAGES = 'pdf_too_many_pages'
PDF_UNREADABLE = 'pdf_unreadable'


_pdfium_lock = threading.Lock()


class InvalidInvoicePdfError(ValueError):
    """PDF refusé — le message est destiné au commerçant (aucun détail technique)."""

    def __init__(self, message: str, code: str) -> None:
        super().__init__(message)
        self.code = code


_UNREADABLE_MESSAGE = 'Ce PDF est illisible ou endommagé.'


def validate_invoice_pdf(file: UploadedFile) -> None:
    """Ouvre le PDF : mot de passe, contenu illisible ou trop de pages → refus."""
    file.seek(0)
    content = file.read()
    file.seek(0)

    max_pages: int = settings.OCR_PDF_MAX_PAGES
    with _pdfium_lock:
        try:
            document = pdfium.PdfDocument(content)
        except pdfium.PdfiumError as exc:
            if exc.err_code == pdfium_c.FPDF_ERR_PASSWORD:
                raise InvalidInvoicePdfError(
                    'Ce PDF est protégé par un mot de passe. '
                    'Enregistrez-le sans mot de passe, puis envoyez-le à nouveau.',
                    PDF_PROTECTED,
                ) from exc
            raise InvalidInvoicePdfError(_UNREADABLE_MESSAGE, PDF_UNREADABLE) from exc
        try:
            pages = len(document)
        finally:
            document.close()

    if pages == 0:
        raise InvalidInvoicePdfError(_UNREADABLE_MESSAGE, PDF_UNREADABLE)
    if pages > max_pages:
        raise InvalidInvoicePdfError(
            f'Ce PDF compte {pages} pages : {max_pages} au maximum. '
            'Envoyez seulement les pages de la facture.',
            PDF_TOO_MANY_PAGES,
        )
