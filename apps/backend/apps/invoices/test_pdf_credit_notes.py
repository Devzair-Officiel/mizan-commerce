"""PDF des avoirs et des factures créditées (URS-112, spec §12 n° 13)."""

import re
from decimal import Decimal
from types import SimpleNamespace

import pytest
from django.db.models import F
from django.urls import reverse
from rest_framework.test import APIClient

from .models import Invoice
from .pdf import build_invoice_pdf
from .pdf_style import InvoiceStyle
from .preview import reference_invoice
from .test_credit_notes import _credit, _issued
from .test_pdf import text_pages
from .tests import _make_shop

# Texte complet de la facture de référence avant les avoirs : inchangé.
REFERENCE_TEXT = (
    'L La Boutique de Youssef Prêt-à-porter et accessoires FACTURE '
    'N° fact-131026-0007 Émise le 13/10/2026 · échéance 12/11/2026 '
    'PARTIELLEMENT PAYÉE ÉMETTEUR La Boutique de Youssef 12 rue des Lilas, '
    '75011 Paris SIRET 912 345 678 00012 contact@boutique-youssef.fr '
    '+33 1 23 45 67 89 FACTURÉ À Karima Bensouda 8 rue Victor Hugo, 69002 Lyon '
    'karima.b@exemple.fr +33 6 12 34 56 78 Commande 2026-054 du 13/10/2026 '
    'DÉSIGNATION QTÉ PRIX UNITAIRE MONTANT Chemise en lin blanc Taille M 2 '
    '29,99 € 59,98 € Ceinture tressée marron 1 19,99 € 19,99 € Frais de '
    'livraison 1 4,90 € 4,90 € Sous-total HT 84,87 € Remise − 5,00 € '
    'Total TTC 79,87 € TVA Non applicable Déjà réglé − 30,00 € RESTE À PAYER '
    '49,87 € RÉCAPITULATIF DU COMPTE CLIENT Solde dû avant cette facture '
    '(fact-111026-0003, fact-121026-0005) 74,90 € Règlements reçus sur cette '
    'facture − 30,00 € Présente facture 79,87 € Solde total du compte 124,77 € '
    'RÈGLEMENT Paiement sous 30 jours. Moyens acceptés : espèces, carte, '
    'virement. IBAN FR76 3000 6000 0112 3456 7890 189 BIC AGRIFRPP MENTIONS '
    'TVA non applicable, article 293 B du Code général des impôts. Aucun '
    'escompte pour paiement anticipé. La Boutique de Youssef · 12 rue des '
    'Lilas, 75011 Paris · SIRET 912 345 678 00012 · Merci de votre confiance. '
    'Page 1 sur 1'
)
AMOUNT = re.compile(r'(− )?\d[\d ]*,\d\d €')


def _text(pdf: bytes) -> str:
    return ' '.join(' '.join(text_pages(pdf)).split())


def _money(invoice: Invoice, value: Decimal) -> str:
    return ' '.join(InvoiceStyle(invoice).money(value).split())


@pytest.fixture
def ctx() -> SimpleNamespace:
    user, shop, _, customer = _make_shop('credit-pdf@example.com')
    api = APIClient()
    api.force_authenticate(user)
    return SimpleNamespace(user=user, shop=shop, customer=customer, api=api)


def _pdf(ctx: SimpleNamespace, invoice: Invoice):
    return ctx.api.get(reverse('invoice-pdf', args=[invoice.pk]))


def _partial(ctx: SimpleNamespace) -> tuple[Invoice, Invoice]:
    """Facture de 102,00 € TTC sans remise ; avoir d'un atelier et de la
    livraison (18,00 € TTC)."""
    invoice = _issued(ctx, discount_amount=Decimal('0'))
    atelier = invoice.lines.get(description='Atelier')
    note = _credit(
        ctx,
        invoice,
        [{'line': atelier.pk, 'quantity': Decimal('1')}],
        reason='Article retourné',
        include_shipping=True,
    )
    return Invoice.objects.get(pk=invoice.pk), note


@pytest.mark.django_db
def test_credit_note_pdf_prints_origin_reason_and_negative_amounts(ctx) -> None:
    invoice, note = _partial(ctx)
    response = _pdf(ctx, note)
    assert response.status_code == 200
    assert response['Content-Disposition'] == f'inline; filename="{note.number}.pdf"'
    text = _text(response.content)
    issued = invoice.issued_at.strftime('%d/%m/%Y')
    for value in [
        'AVOIR',
        f'N° {note.number}',
        f'Avoir sur la facture n° {invoice.number} du {issued}',
        'Motif : Article retourné',
        'Atelier 1 − 10,00 € − 10,00 €',
        'Sous-total HT − 10,00 €',
        'Frais de livraison − 5,00 €',
        'TVA 20 % − 3,00 €',
        'TOTAL TTC − 18,00 €',
        'MENTIONS',
    ]:
        assert value in text, value
    # Signe à l'affichage seulement : l'avoir reste enregistré en positif.
    assert note.total_ttc == Decimal('18.00')
    amounts = [match.group(0) for match in AMOUNT.finditer(text)]
    assert len(amounts) == 6
    assert all(amount.startswith('− ') for amount in amounts), amounts
    # Ni échéance, ni règlement, ni relevé de compte, ni badge de paiement.
    for absent in ['échéance', 'RÈGLEMENT', 'RESTE À PAYER', 'Déjà réglé', 'PAYÉE']:
        assert absent not in text, absent
    assert 'RÉCAPITULATIF' not in text


@pytest.mark.django_db
def test_credit_note_pdf_follows_the_invoice_language(ctx) -> None:
    _invoice, note = _partial(ctx)
    note.presentation['language'] = 'en'
    text = _text(build_invoice_pdf(note))
    assert 'CREDIT NOTE' in text and 'Credit note for invoice No.' in text
    assert 'Reason: Article retourné' in text and 'Page 1 of 1' in text


@pytest.mark.django_db
def test_partially_credited_invoice_lists_notes_and_net_remaining(ctx) -> None:
    invoice, note = _partial(ctx)
    second = _credit(
        ctx,
        invoice,
        [{'line': invoice.lines.get(description='Coaching').pk, 'quantity': 1}],
    )
    text = _text(_pdf(ctx, invoice).content)
    remaining = invoice.total_ttc - note.total_ttc - second.total_ttc
    assert (
        'Déjà réglé 0,00 € Avoirs émis '
        f'{note.number} {_money(invoice, -note.total_ttc)} '
        f'{second.number} {_money(invoice, -second.total_ttc)} '
        f'RESTE À PAYER {_money(invoice, remaining)}'
    ) in text
    assert 'NON PAYÉE' in text and 'CRÉDITÉE' not in text


@pytest.mark.django_db
@pytest.mark.parametrize('status', ['issued', 'paid'])
def test_fully_credited_invoice_prints_credited_instead_of_payment(
    ctx, status: str
) -> None:
    invoice = _issued(ctx)
    if status == 'paid':
        Invoice.objects.filter(pk=invoice.pk).update(
            status='paid', amount_paid=invoice.total_ttc
        )
    note = _credit(ctx, invoice, reason='Prestation annulée')
    text = _text(_pdf(ctx, invoice).content)
    assert 'CRÉDITÉE' in text and 'PAYÉE' not in text
    assert f'Avoirs émis {note.number} − 92,40 € RESTE À PAYER 0,00 €' in text


@pytest.mark.django_db
def test_invoice_settled_by_credit_note_and_payment_prints_credited(ctx) -> None:
    # Avoir partiel, reste réglé avec la commande : facture émise, net dû nul.
    invoice, note = _partial(ctx)
    Invoice.objects.filter(pk=invoice.pk).update(
        amount_paid=F('total_ttc') - F('credited_total')
    )
    text = _text(_pdf(ctx, invoice).content)
    assert 'CRÉDITÉE' in text and 'PAYÉE' not in text
    assert f'{note.number} − 18,00 € RESTE À PAYER 0,00 €' in text


@pytest.mark.django_db
def test_invoice_without_credit_note_is_unchanged() -> None:
    # Non-régression : texte complet, ordre des blocs compris.
    assert _text(build_invoice_pdf(reference_invoice())) == REFERENCE_TEXT


@pytest.mark.django_db
def test_credit_note_pdf_is_scoped_to_the_shop(ctx) -> None:
    _invoice, note = _partial(ctx)
    intruder, _, _, _ = _make_shop('credit-pdf-intruder@example.com')
    api = APIClient()
    api.force_authenticate(intruder)
    assert api.get(reverse('invoice-pdf', args=[note.pk])).status_code == 404
