from datetime import datetime, timedelta, timezone as dt_timezone
from decimal import Decimal
from io import BytesIO
from unittest.mock import patch

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from PIL import Image
from rest_framework.test import APIClient

from apps.accounts.factories import UserFactory
from apps.customers.factories import CustomerFactory
from apps.public_pages.factories import PublicPageFactory
from apps.public_pages.services import upload_page_logo
from apps.shops.models import ShopMember
from apps.shops.services import delete_shop_logo, upload_shop_logo
from apps.subscriptions.models import SubscriptionPlan
from apps.subscriptions.test_utils import attach_subscription
from .colors import accessible_color, inspect_logo, white_contrast
from .models import DocumentSequence, Invoice
from .pdf import build_invoice_pdf
from .services import issue_invoice_from_order
from .settings import example_invoice, update_invoice_settings
from .tests import _make_order_with_items, _make_shop


def logo(color: str, *, transparent: bool = False) -> SimpleUploadedFile:
    image = Image.new('RGBA', (80, 80), color)
    if transparent:
        image.putalpha(0)
    buf = BytesIO()
    image.save(buf, format='PNG')
    return SimpleUploadedFile('logo.png', buf.getvalue(), content_type='image/png')


@pytest.mark.parametrize('color', ['white', 'black', '#777777', '#fefefe'])
def test_achromatic_logo_is_neutral(color: str) -> None:
    assert inspect_logo(logo(color).read(), 'image/png')[0] == ''


def test_dominant_color_ignores_transparency_and_background() -> None:
    image = Image.new('RGBA', (100, 100), 'white')
    image.paste(Image.new('RGBA', (40, 40), '#ffcc00'), (10, 10))
    image.paste(Image.new('RGBA', (40, 40), '#ff000000'), (55, 55))
    buf = BytesIO()
    image.save(buf, format='PNG')
    color, _ = inspect_logo(buf.getvalue(), 'image/png')
    assert color != ''
    assert white_contrast(color) >= 4.5
    assert inspect_logo(logo('#ffcc00', transparent=True).read(), 'image/png')[0] == ''


@pytest.mark.parametrize(
    'color', ['#ffffff', '#ffcc00', '#00ff00', '#ff0000', '#367762', '#000000']
)
def test_chosen_color_is_darkened_only_if_needed(color: str) -> None:
    adjusted = accessible_color(color)
    assert white_contrast(adjusted) >= 4.5
    if white_contrast(color) >= 4.5:
        assert adjusted == color


@pytest.fixture
def context():
    return _make_shop('invoice-settings@example.com')


@pytest.fixture
def client(context):
    api = APIClient()
    api.force_authenticate(context[0])
    return api


@pytest.mark.django_db
def test_settings_validate_and_isolate_shop(client, context) -> None:
    _, shop, _, _ = context
    attach_subscription(shop, plan_code=SubscriptionPlan.CODE_BOUTIQUE)
    _, other, _, _ = _make_shop('other-settings@example.com')
    url = reverse('invoice-settings')
    assert client.get(url).status_code == 200
    response = client.patch(
        url,
        {
            'invoice_color_mode': 'custom',
            'invoice_color': '#ffff00',
            'siret': '912 345 678 00012',
            'invoice_vat_regime': 'exempt',
            'legal_mentions': 'Aucun escompte.',
            'default_payment_terms_days': 0,
            'invoice_payment_methods': ['cash', 'transfer'],
            'invoice_iban': 'FR76 3000 6000 0112 3456 7890 189',
            'invoice_bic': 'AGRIFRPP',
        },
        format='json',
    )
    assert response.status_code == 200, response.data
    assert response.data['siret'] == '91234567800012'
    assert white_contrast(response.data['resolved_color']) >= 4.5
    shop.refresh_from_db()
    other.refresh_from_db()
    assert shop.default_tax_rate == 0
    assert other.invoice_color_mode == 'automatic'
    assert other.legal_mentions != shop.legal_mentions


@pytest.mark.django_db
@pytest.mark.parametrize(
    'payload',
    [
        {'invoice_color': 'red'},
        {'invoice_color_mode': 'unknown'},
        {'siret': '123'},
        {'invoice_vat_regime': 'applicable', 'vat_number': ''},
        {'invoice_payment_methods': ['bitcoin']},
        {'invoice_iban': 'FR7530006000011234567890189'},
        {'invoice_bic': 'bad'},
        {'default_payment_terms_days': -1},
        {'default_payment_terms_days': 366},
        {'default_tax_rate': '101'},
    ],
)
def test_invalid_settings_are_rejected(client, payload: dict) -> None:
    assert (
        client.patch(reverse('invoice-settings'), payload, format='json').status_code
        == 400
    )


@pytest.mark.django_db
@pytest.mark.parametrize(
    'role,expected', [('owner', 200), ('admin', 200), ('staff', 403)]
)
def test_settings_and_example_permissions(context, role: str, expected: int) -> None:
    user, shop, _, _ = context
    attach_subscription(shop, plan_code=SubscriptionPlan.CODE_BOUTIQUE)
    ShopMember.objects.filter(shop=shop, user=user).update(
        role=role, permissions=['invoices']
    )
    client = APIClient()
    client.force_authenticate(user)
    assert client.get(reverse('invoice-settings')).status_code == expected
    assert (
        client.patch(
            reverse('invoice-settings'),
            {'invoice_color_mode': 'neutral'},
            format='json',
        ).status_code
        == expected
    )
    assert client.get(reverse('invoice-example')).status_code == expected


@pytest.mark.django_db
@pytest.mark.parametrize(
    'plan', [SubscriptionPlan.CODE_FREE, SubscriptionPlan.CODE_SOLO]
)
@pytest.mark.parametrize(
    'payload', [{'invoice_color_mode': 'custom'}, {'invoice_color': '#9c4f2c'}]
)
def test_color_is_refused_below_boutique(client, context, plan, payload) -> None:
    _, shop, _, _ = context
    attach_subscription(shop, plan_code=plan)
    response = client.patch(reverse('invoice-settings'), payload, format='json')
    assert response.status_code == 400
    assert response.data['code'] == 'plan_feature_required'
    assert response.data['feature'] == 'invoice_branding'
    shop.refresh_from_db()
    assert (shop.invoice_color_mode, shop.invoice_color) == ('automatic', '#367762')


@pytest.mark.django_db
def test_unchanged_color_keeps_other_settings_savable(client, context) -> None:
    """Le formulaire renvoie tous ses champs : une couleur inchangée ne bloque rien."""
    _, shop, _, _ = context
    response = client.patch(
        reverse('invoice-settings'),
        {
            'invoice_color_mode': shop.invoice_color_mode,
            'invoice_color': shop.invoice_color.upper(),
            'siret': '91234567800012',
        },
        format='json',
    )
    assert response.status_code == 200, response.data
    shop.refresh_from_db()
    assert shop.siret == '91234567800012'


@pytest.mark.django_db
@pytest.mark.parametrize(
    'plan', [SubscriptionPlan.CODE_BOUTIQUE, SubscriptionPlan.CODE_COMMERCE_PLUS]
)
def test_color_is_allowed_from_boutique(client, context, plan) -> None:
    _, shop, _, _ = context
    attach_subscription(shop, plan_code=plan)
    response = client.patch(
        reverse('invoice-settings'),
        {'invoice_color_mode': 'custom', 'invoice_color': '#9c4f2c'},
        format='json',
    )
    assert response.status_code == 200, response.data
    shop.refresh_from_db()
    assert (shop.invoice_color_mode, shop.invoice_color) == ('custom', '#9c4f2c')


@pytest.mark.django_db
def test_color_gate_follows_the_member_shop(context) -> None:
    """La formule Boutique d'une autre boutique ne débloque rien pour la sienne."""
    _, shop, _, _ = context
    attach_subscription(shop, plan_code=SubscriptionPlan.CODE_BOUTIQUE)
    other_user, other, _, _ = _make_shop('other-branding@example.com')
    api = APIClient()
    api.force_authenticate(other_user)
    payload = {'invoice_color_mode': 'custom', 'invoice_color': '#9c4f2c'}
    assert api.patch(reverse('invoice-settings'), payload, format='json').status_code == 400  # noqa: E501
    other.refresh_from_db()
    shop.refresh_from_db()
    assert other.invoice_color_mode == 'automatic'
    assert shop.invoice_color_mode == 'automatic'


@pytest.mark.django_db
def test_pdf_ignores_branding_saved_before_downgrade(context) -> None:
    """Couleur et logo restent en base après un retour en Solo : facture neutre."""
    user, shop, variant, customer = context
    attach_subscription(shop, plan_code=SubscriptionPlan.CODE_BOUTIQUE)
    update_invoice_settings(shop, {'invoice_color_mode': 'custom', 'invoice_color': '#9c4f2c'})  # noqa: E501
    shop.refresh_from_db()
    type(shop).objects.filter(pk=shop.pk).update(logo_object_key='shops/logo.png')
    attach_subscription(shop, plan_code=SubscriptionPlan.CODE_SOLO)
    shop.refresh_from_db()
    invoice = issue_invoice_from_order(
        shop=shop, order=_make_order_with_items(shop, user, variant, customer)
    )
    assert invoice.presentation['color'] == ''
    assert invoice.presentation['logo_object_key'] == ''
    example = example_invoice(shop, 'fr')
    assert example.presentation['color'] == ''
    assert example.presentation['logo_object_key'] == ''


@pytest.mark.django_db
def test_settings_require_membership_and_authentication() -> None:
    client = APIClient()
    assert client.get(reverse('invoice-settings')).status_code == 401
    client.force_authenticate(UserFactory())
    assert client.get(reverse('invoice-settings')).status_code == 403
    assert client.get(reverse('invoice-example')).status_code == 403


@pytest.mark.django_db
def test_example_is_read_only_and_uses_saved_settings(client, context) -> None:
    _, shop, _, _ = context
    count = Invoice.objects.filter(shop=shop).count()
    seq = DocumentSequence.objects.filter(shop=shop).first()
    response = client.get(reverse('invoice-example'))
    assert response.status_code == 200
    assert response['Content-Type'] == 'application/pdf'
    assert response.content.startswith(b'%PDF-')
    assert Invoice.objects.filter(shop=shop).count() == count
    assert DocumentSequence.objects.filter(shop=shop).first() == seq
    assert example_invoice(shop, 'ar').presentation['language'] == 'fr'
    assert example_invoice(shop, 'en').presentation['language'] == 'en'


@pytest.mark.django_db
def test_every_printed_setting_is_frozen_even_pdf(context) -> None:
    user, shop, variant, customer = context
    attach_subscription(shop, plan_code=SubscriptionPlan.CODE_BOUTIQUE)
    page = PublicPageFactory(shop=shop, tagline='Prêt-à-porter')
    shop = update_invoice_settings(
        shop,
        {
            'invoice_color_mode': 'custom',
            'invoice_color': '#9c4f2c',
            'siret': '91234567800012',
            'invoice_payment_methods': ['transfer'],
            'invoice_iban': 'FR7630006000011234567890189',
            'invoice_bic': 'AGRIFRPP',
            'invoice_show_account_summary': True,
        },
    )
    order = _make_order_with_items(shop, user, variant, customer)
    invoice = issue_invoice_from_order(shop=shop, order=order, language='en')
    snapshot = invoice.presentation.copy()
    original_pdf = build_invoice_pdf(invoice)
    shop = update_invoice_settings(
        shop,
        {
            'name': 'Changed',
            'siret': '',
            'legal_address': 'Elsewhere',
            'legal_mentions': 'Changed',
            'invoice_color_mode': 'neutral',
            'invoice_iban': '',
            'invoice_bic': '',
            'invoice_show_order': False,
            'invoice_show_account_summary': False,
            'default_payment_terms_days': 90,
            'default_tax_rate': Decimal('5'),
        },
    )
    page.tagline = 'Changed activity'
    page.save()
    customer.name = 'Changed buyer'
    customer.save()
    user.language = 'ar'
    user.save()
    invoice.refresh_from_db()
    assert invoice.presentation == snapshot
    assert invoice.presentation['activity'] == 'Prêt-à-porter'
    assert build_invoice_pdf(invoice) == original_pdf


@pytest.mark.django_db
@pytest.mark.parametrize('days', [0, 15, 365])
def test_due_date_uses_shop_local_date(context, days: int) -> None:
    user, shop, variant, customer = context
    order = _make_order_with_items(shop, user, variant, customer)
    shop.default_payment_terms_days = days
    shop.save()
    now = datetime(2026, 10, 14, 23, 30, tzinfo=dt_timezone.utc)
    with patch('apps.invoices.services.timezone.now', return_value=now):
        invoice = issue_invoice_from_order(shop=shop, order=order)
    assert invoice.due_date == now.date() + timedelta(days=days + 1)
    assert invoice.presentation['payment_terms_days'] == days


@pytest.mark.django_db
def test_bank_details_hidden_without_transfer_and_exempt_vat(context) -> None:
    user, shop, variant, customer = context
    shop = update_invoice_settings(
        shop,
        {
            'invoice_payment_methods': ['cash'],
            'invoice_iban': 'FR7630006000011234567890189',
            'invoice_bic': 'AGRIFRPP',
            'invoice_vat_regime': 'exempt',
        },
    )
    invoice = issue_invoice_from_order(
        shop=shop,
        order=_make_order_with_items(shop, user, variant, customer),
        tax_rate=Decimal('20'),
    )
    assert invoice.presentation['iban'] == invoice.presentation['bic'] == ''
    assert invoice.tax_rate == invoice.tax_amount == 0


@pytest.mark.django_db
def test_account_summary_is_net_isolated_and_frozen(context) -> None:
    user, shop, variant, customer = context
    shop.invoice_show_account_summary = True
    shop.save()

    def issue(customer=customer):
        return issue_invoice_from_order(
            shop=shop, order=_make_order_with_items(shop, user, variant, customer)
        )

    previous = issue()  # 24, received 4 -> due 20
    Invoice.objects.filter(shop=shop, pk=previous.pk).update(amount_paid=4)
    paid = issue()
    Invoice.objects.filter(shop=shop, pk=paid.pk).update(status='paid', amount_paid=24)
    cancelled = issue()
    Invoice.objects.filter(shop=shop, pk=cancelled.pk).update(status='cancelled')
    issue(CustomerFactory(shop=shop))
    _, other_shop, other_variant, other_customer = _make_shop(
        'summary-other@example.com'
    )
    issue_invoice_from_order(
        shop=other_shop,
        order=_make_order_with_items(other_shop, user, other_variant, other_customer),
    )
    order = _make_order_with_items(shop, user, variant, customer)
    order.amount_paid = Decimal('5')
    order.save()
    invoice = issue_invoice_from_order(shop=shop, order=order)
    summary = invoice.presentation['account_summary']
    assert Decimal(summary['previous_balance']) == 20
    assert Decimal(summary['payments_received']) == 5
    assert Decimal(summary['current_invoice']) == 24
    assert Decimal(summary['total_balance']) == 39
    assert summary['previous_invoices'] == [{'number': previous.number, 'due': '20.00'}]
    Invoice.objects.filter(shop=shop, pk=previous.pk).update(
        amount_paid=24, status='paid'
    )
    invoice.refresh_from_db()
    assert invoice.presentation['account_summary'] == summary
    assert Decimal(issue(None).presentation['account_summary']['previous_balance']) == 0


@pytest.mark.django_db
def test_logo_shared_and_kept_when_referenced(context, settings) -> None:
    user, shop, variant, customer = context
    # Le logo n'apparaît sur la facture qu'à partir de la formule Boutique.
    attach_subscription(shop, plan_code=SubscriptionPlan.CODE_BOUTIQUE)
    settings.AWS_S3_ENDPOINT_URL = 'https://storage.example.com'
    settings.AWS_ACCESS_KEY_ID = 'test'
    page = PublicPageFactory(shop=shop)
    with (
        patch('apps.shops.services.upload_fileobj'),
        patch('apps.shops.services.delete_object') as delete,
    ):
        upload_page_logo(page, logo('#ffcc00'))
        shop.refresh_from_db()
        key = shop.logo_object_key
        assert page.logo_object_key == key
        assert white_contrast(shop.invoice_auto_color) >= 4.5
        invoice = issue_invoice_from_order(
            shop=shop, order=_make_order_with_items(shop, user, variant, customer)
        )
        assert invoice.presentation['logo_object_key'] == key
        shop = upload_shop_logo(shop, logo('#ff0000'))
        assert key not in [call.args[0] for call in delete.call_args_list]
        temporary_key = shop.logo_object_key
        shop = delete_shop_logo(shop)
        delete.assert_called_with(temporary_key)
        assert key not in [call.args[0] for call in delete.call_args_list]
        page.refresh_from_db()
        assert (
            shop.logo_object_key
            == page.logo_object_key
            == shop.invoice_auto_color
            == ''
        )


@pytest.mark.django_db
def test_logo_invalid_content_is_rejected_before_storage(context, settings) -> None:
    from rest_framework.exceptions import ValidationError

    settings.AWS_S3_ENDPOINT_URL = 'https://storage.example.com'
    settings.AWS_ACCESS_KEY_ID = 'test'
    with patch('apps.shops.services.upload_fileobj') as upload:
        with pytest.raises(ValidationError):
            upload_shop_logo(
                context[1],
                SimpleUploadedFile(
                    'fake.png', b'not an image', content_type='image/png'
                ),
            )
        upload.assert_not_called()


@pytest.mark.django_db
def test_spaced_identifiers_save_as_the_same_compact_values(client, context) -> None:
    response = client.patch(
        reverse('invoice-settings'),
        {
            'siret': '912\u00a0345 678 00012',
            'vat_number': 'FR12 345 678 901',
            'invoice_vat_regime': 'applicable',
            'invoice_iban': 'FR76 3000 6000 0112 3456 7890 189',
        },
        format='json',
    )
    assert response.status_code == 200
    context[1].refresh_from_db()
    assert context[1].siret == '91234567800012'
    assert context[1].vat_number == 'FR12345678901'
    assert context[1].invoice_iban == 'FR7630006000011234567890189'
    assert client.get(reverse('invoice-settings')).data['siret'] == '91234567800012'


@pytest.mark.django_db
@pytest.mark.parametrize(
    'payload,field,fragment',
    [
        ({'siret': '912 345 678 0001'}, 'siret', '14 chiffres'),
        (
            {'invoice_iban': 'FR75 3000 6000 0112 3456 7890 189'},
            'invoice_iban',
            'clé de contrôle',
        ),
    ],
)
def test_identifier_errors_are_specific_and_do_not_change_saved_values(
    client, context, payload: dict, field: str, fragment: str
) -> None:
    before = getattr(context[1], field)
    response = client.patch(reverse('invoice-settings'), payload, format='json')
    assert response.status_code == 400
    assert fragment in str(response.data['errors'][field])
    context[1].refresh_from_db()
    assert getattr(context[1], field) == before
