from decimal import Decimal

import pypdfium2 as pdfium
import pytest

from .pdf import build_invoice_pdf
from .preview import reference_invoice


def text_pages(content: bytes) -> list[str]:
    texts = []
    with pdfium.PdfDocument(content) as document:
        for page in document:
            text = page.get_textpage()
            texts.append(text.get_text_range())
            text.close()
            page.close()
    return texts


@pytest.mark.django_db
@pytest.mark.parametrize('neutral', [False, True])
def test_pdf_accents_amounts_format_and_snapshot(neutral: bool) -> None:
    invoice = reference_invoice(neutral=neutral)
    pdf = build_invoice_pdf(invoice)
    text = text_pages(pdf)
    assert len(text) == 1
    for value in [
        'ÉMETTEUR',
        'FACTURÉ À',
        'DÉSIGNATION',
        'Taille M',
        'RÈGLEMENT',
        '49,87',
        '124,77',
        '293 B',
        'AGRIFRPP',
        '2026-054',
        'Page 1 sur 1',
    ]:
        assert value in text[0]
    assert build_invoice_pdf(invoice) == pdf


@pytest.mark.django_db
def test_multipage_has_repeated_table_headers_and_numbered_footers() -> None:
    pages = text_pages(build_invoice_pdf(reference_invoice(lines=50)))
    assert len(pages) == 3
    for i, page in enumerate(pages, 1):
        assert f'Page {i} sur 3' in page
        assert 'Merci de votre confiance.' in page
        assert '912 345 678 00012' in page
    for page in pages:
        assert 'DÉSIGNATION' in page
    assert 'Article de démonstration 50' in ''.join(pages)
    assert 'SOLDE TOTAL' not in pages[0]  # le récapitulatif suit les lignes.


@pytest.mark.django_db
@pytest.mark.parametrize(
    'state,paid,label',
    [
        ('issued', '0', 'NON PAYÉE'),
        ('issued', '30', 'PARTIELLEMENT PAYÉE'),
        ('paid', '79.87', 'PAYÉE'),
        ('cancelled', '30', 'ANNULÉE'),
    ],
)
def test_pdf_payment_states(state: str, paid: str, label: str) -> None:
    invoice = reference_invoice()
    invoice.status = state
    invoice.amount_paid = Decimal(paid)
    assert label in text_pages(build_invoice_pdf(invoice))[0]


@pytest.mark.django_db
def test_pdf_language_options_and_untrusted_text() -> None:
    invoice = reference_invoice()
    invoice.presentation.update(
        language='en',
        show_account_summary=False,
        order_number='',
        iban='',
        bic='',
        payment_methods=['cash'],
    )
    invoice.seller_legal_mentions = '<script>danger & é</script>'
    text = text_pages(build_invoice_pdf(invoice))[0]
    assert 'INVOICE' in text and 'Page 1 of 1' in text
    assert 'Customer account summary' not in text
    assert '2026-054' not in text and 'AGRIFRPP' not in text
    assert '<script>danger & é</script>' in text
    assert 'VAT not applicable' in text


@pytest.mark.django_db
def test_pdf_embeds_the_snapshot_logo_in_color_and_neutral() -> None:
    from unittest.mock import patch
    from .test_settings import logo

    content = logo('#ffcc00').read()
    for neutral in (False, True):
        invoice = reference_invoice(neutral=neutral)
        invoice.presentation['logo_object_key'] = 'shops/reference/logo-immutable.png'
        with (
            patch('apps.invoices.pdf_blocks.is_storage_configured', return_value=True),
            patch(
                'apps.invoices.pdf_blocks.download_bytes',
                return_value=content,
            ) as download,
        ):
            before = build_invoice_pdf(invoice)
            invoice.shop.logo_object_key = 'shops/reference/logo-replaced.png'
            invoice.shop.invoice_color = '#ff0000'
            assert build_invoice_pdf(invoice) == before
            assert b'/Subtype /Image' in before
            assert all(
                call.args == ('shops/reference/logo-immutable.png',)
                for call in download.call_args_list
            )


@pytest.mark.django_db
def test_zero_rate_is_distinct_from_vat_exemption() -> None:
    invoice = reference_invoice()
    invoice.presentation.update(vat_regime='applicable', vat_number='FR123456789')
    invoice.tax_rate = Decimal('0')
    text = text_pages(build_invoice_pdf(invoice))[0]
    assert 'TVA 0 %' in text
    assert 'Non applicable' not in text
    assert '293 B' not in text


@pytest.mark.django_db
@pytest.mark.parametrize('count', [18, 28, 50])
def test_rows_and_financial_blocks_stay_whole_across_page_breaks(count: int) -> None:
    invoice = reference_invoice(lines=count)
    lines = list(invoice.lines.all())
    # Une ligne haute doit rester entière à proximité d'un saut de page.
    lines[15].product_name = 'Début ligne indivisible ' + 'description détaillée ' * 6
    lines[15].variant_name = 'Fin ligne indivisible'
    pages = text_pages(build_invoice_pdf(invoice))
    joined = [' '.join(page.split()) for page in pages]
    row_page = next(page for page in joined if 'Début ligne indivisible' in page)
    assert 'Fin ligne indivisible' in row_page
    totals_page = next(page for page in joined if 'Sous-total HT' in page)
    assert 'RESTE À PAYER' in totals_page
    summary_page = next(
        page for page in joined if 'RÉCAPITULATIF DU COMPTE CLIENT' in page
    )
    assert 'Solde total du compte' in summary_page
    payment_page = next(page for page in joined if 'RÈGLEMENT' in page)
    assert 'MENTIONS' in payment_page and 'Aucun escompte' in payment_page
    for i, page in enumerate(joined, 1):
        assert f'Page {i} sur {len(pages)}' in page
        assert 'Merci de votre confiance.' in page
