"""PDF des devis (URS-111, spec §12 n° 12 et 13)."""

from datetime import date, datetime, timezone
from types import SimpleNamespace

import pytest
from django.urls import reverse

from apps.accounts.models import User
from apps.invoices.test_pdf import text_pages
from apps.invoices.tests import _make_shop
from apps.shops.models import Shop

from .models import Quote
from .test_api import _client, _create, _send, _status


@pytest.fixture
def ctx() -> SimpleNamespace:
    user, shop, _, customer = _make_shop('quotes-pdf@example.com')
    shop.invoice_payment_methods = ['transfer']
    shop.invoice_iban = 'FR7630006000011234567890189'
    shop.legal_mentions = 'Assurance décennale n° 42.'
    shop.save(
        update_fields=['invoice_payment_methods', 'invoice_iban', 'legal_mentions']
    )
    return SimpleNamespace(user=user, shop=shop, customer=customer, api=_client(user))


def _sent(ctx: SimpleNamespace, **payload) -> Quote:
    draft = _create(ctx, **payload)
    assert _send(ctx, draft['id']).status_code == 200
    return Quote.objects.get(pk=draft['id'])


def _pdf(ctx: SimpleNamespace, quote: Quote):
    return ctx.api.get(reverse('quote-pdf', args=[quote.pk]))


def _text(response) -> str:
    assert response.status_code == 200
    assert response['Content-Type'] == 'application/pdf'
    return ' '.join(' '.join(text_pages(response.content)).split())


@pytest.mark.django_db
def test_sent_quote_pdf_prints_every_mention(ctx) -> None:
    quote = _sent(
        ctx, discount_amount='12.50', shipping_amount='20.00', notes='Accès cour B'
    )
    response = _pdf(ctx, quote)
    assert response['Content-Disposition'] == f'inline; filename="{quote.number}.pdf"'
    text = _text(response)
    sent = date.fromisoformat(quote.presentation['sent_date']).strftime('%d/%m/%Y')
    valid = quote.valid_until.strftime('%d/%m/%Y')
    for value in [
        'DEVIS',
        f'N° {quote.number}',
        f"Émis le {sent} · valable jusqu'au {valid}",
        'CLIENT',
        'Dupont',
        'Pose de parquet Chêne massif 25 42,50 € / m² 1 062,50 €',
        'Sous-total HT 1 062,50 € Remise − 12,50 € Frais de livraison 20,00 €',
        'TVA 20 % 214,00 € TOTAL TTC 1 284,00 €',
        'Paiement sous 30 jours.',
        'Moyens acceptés : virement.',
        'IBAN FR76',
        'Assurance décennale n° 42.',
        'Accès cour B',
        f"Devis gratuit. Offre valable jusqu'au {valid}.",
        'BON POUR ACCORD',
        'Faites précéder votre signature de la mention manuscrite '
        '« Bon pour accord ». Date Signature',
    ]:
        assert value in text, value
    # Pas encore de réponse : ni badge, ni acceptation, ni règlement reçu.
    for absent in ['Accepté', 'ACCEPTÉ', 'Déjà réglé', 'RESTE À PAYER', 'FACTURÉ À']:
        assert absent not in text, absent


@pytest.mark.django_db
def test_accepted_quote_pdf_prints_who_accepted_and_when(ctx) -> None:
    quote = _sent(ctx)
    _status(ctx, str(quote.pk), status='accepted', accepted_name='Jean Dupont')
    accepted_at = datetime(2026, 10, 30, 23, 30, tzinfo=timezone.utc)
    Quote.objects.filter(pk=quote.pk).update(accepted_at=accepted_at)
    text = _text(_pdf(ctx, quote))
    # Date dans le fuseau de la boutique (Europe/Paris) : le 31.
    assert 'BON POUR ACCORD Accepté par Jean Dupont le 31/10/2026.' in text
    assert 'ACCEPTÉ' in text
    assert 'Signature' not in text and 'mention manuscrite' not in text


@pytest.mark.django_db
def test_quote_pdf_reads_the_snapshots_never_the_shop(ctx) -> None:
    quote = _sent(ctx)
    before = _pdf(ctx, quote).content
    Shop.objects.filter(pk=ctx.shop.pk).update(
        name='Autre nom', legal_address='1 place Neuve', legal_mentions='Changé'
    )
    ctx.customer.name = 'Renommé'
    ctx.customer.save(update_fields=['name'])
    assert _pdf(ctx, quote).content == before


@pytest.mark.django_db
def test_arabic_account_gets_the_french_pdf_like_invoices(ctx) -> None:
    User.objects.filter(pk=ctx.user.pk).update(language='ar')
    ctx.user.refresh_from_db()
    ctx.api = _client(ctx.user)
    text = _text(_pdf(ctx, _sent(ctx)))
    assert 'DEVIS' in text and 'Devis gratuit.' in text and 'Page 1 sur 1' in text


@pytest.mark.django_db
def test_draft_quote_has_no_pdf(ctx) -> None:
    draft = _create(ctx)
    response = ctx.api.get(reverse('quote-pdf', args=[draft['id']]))
    assert (response.status_code, response.data['code']) == (409, 'not_sent')


@pytest.mark.django_db
def test_quote_pdf_of_another_shop_is_not_found(ctx) -> None:
    quote = _sent(ctx)
    intruder, _, _, _ = _make_shop('quotes-pdf-intruder@example.com')
    response = _client(intruder).get(reverse('quote-pdf', args=[quote.pk]))
    assert response.status_code == 404
