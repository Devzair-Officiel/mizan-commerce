"""Contrôle d'une facture PDF à l'envoi, avant tout stockage.

La signature (`%PDF-`) est vérifiée par `services.validate_file_signature`.
Ce module ouvre ensuite le document avec PDFium (`pypdfium2`, roue autonome,
sans dépendance système) pour refuser tout de suite, avec un message clair :
- un PDF protégé par mot de passe (illisible pour la lecture) ;
- un PDF illisible ou endommagé ;
- un PDF de plus de `OCR_PDF_MAX_PAGES` pages ;
- un PDF dont une page est démesurée (affiche, plan) : le service IA rendrait
  la page en image avant l'OCR.

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
    'PDF_PAGE_TOO_LARGE',
    'PDF_PROTECTED',
    'PDF_TOO_MANY_PAGES',
    'PDF_UNREADABLE',
    'InvalidInvoicePdfError',
    'validate_invoice_pdf',
)

# Codes du refus, renvoyés au frontend qui les traduit
# (les messages restent en français).
PDF_PAGE_TOO_LARGE = 'pdf_page_too_large'
PDF_PROTECTED = 'pdf_protected'
PDF_TOO_MANY_PAGES = 'pdf_too_many_pages'
PDF_UNREADABLE = 'pdf_unreadable'


# Taille d'une page, en points (1/72 de pouce) : surface d'un A2 au plus, et
# côté long de 1,78 m au plus (un long ticket de caisse de 8 cm passe). Mêmes
# bornes dans le service IA (`apps/ai-service/app/pdf.py`).
MAX_PAGE_AREA_PT2 = 1191 * 1684
MAX_PAGE_SIDE_PT = 5040

_pdfium_lock = threading.Lock()


class InvalidInvoicePdfError(ValueError):
    """PDF refusé — le message est destiné au commerçant (aucun détail technique)."""

    def __init__(self, message: str, code: str) -> None:
        super().__init__(message)
        self.code = code


_UNREADABLE_MESSAGE = 'Ce PDF est illisible ou endommagé.'


def validate_invoice_pdf(file: UploadedFile) -> None:
    """Ouvre le PDF : mot de passe, contenu illisible, trop de pages ou page démesurée → refus."""  # noqa: E501
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
            sizes = [document.get_page_size(i) for i in range(min(pages, max_pages))]
        except pdfium.PdfiumError as exc:
            raise InvalidInvoicePdfError(_UNREADABLE_MESSAGE, PDF_UNREADABLE) from exc
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
    if any(_page_too_large(width, height) for width, height in sizes):
        raise InvalidInvoicePdfError(
            'Une page de ce PDF est trop grande (format A2 au maximum). '
            'Envoyez la facture au format A4, ou une photo.',
            PDF_PAGE_TOO_LARGE,
        )


def _page_too_large(width: float, height: float) -> bool:
    return width * height > MAX_PAGE_AREA_PT2 or max(width, height) > MAX_PAGE_SIDE_PT
