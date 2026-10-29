"""Admin interne : accès, verrouillages, données jamais affichées, écritures tracées."""

import uuid
from typing import Any

import pytest
from axes.models import AccessAttempt, AccessFailureLog, AccessLog
from django.contrib import admin
from django.contrib.admin.models import LogEntry
from django.contrib.auth.models import Group
from django.db.models import Model
from django.http import HttpResponse
from django.test import Client, RequestFactory
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.token_blacklist.models import (
    BlacklistedToken,
    OutstandingToken,
)
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.factories import UserFactory
from apps.accounts.models import User
from apps.accounts.services import set_user_active
from apps.comms.factories import MessageSettingsFactory, PreparedMessageFactory
from apps.invoices.services import issue_invoice_from_order
from apps.loyalty.factories import LoyaltyProgramFactory, LoyaltyTransactionFactory
from apps.notes.factories import NoteFactory, ReminderFactory, ReminderSettingsFactory
from apps.ocr.factories import (
    OcrResultFactory,
    ProductScanUsageFactory,
    SupplierLineMatchFactory,
)
from apps.orders.factories import OrderFactory, OrderItemFactory
from apps.products.factories import ProductVariantFactory
from apps.public_pages.factories import (
    ContactButtonFactory,
    PublicCatalogVisibilityFactory,
    PublicPageFactory,
    PublicPageSectionFactory,
)
from apps.public_pages.models import PublicPage
from apps.shops.factories import ShopFactory, ShopMemberFactory
from apps.shops.models import Shop
from apps.stock.factories import StockMovementFactory
from apps.subscriptions.factories import SubscriptionFactory
from apps.subscriptions.models import StripeEvent
from apps.zakat.factories import ZakatProfileFactory, ZakatReceivableFollowUpFactory

from .admin_site import DOMAINS, MizanAdminSite
from .audit import NO_SHOP_ID
from .models import AuditLog

pytestmark = pytest.mark.django_db

IBAN = "FR7630006000011234567890189"
BIC = "AGRIFRPP"
OCR_TEXT = "TEXTE-LU-DANS-LE-FICHIER"
AXES_POST = "password=mot-de-passe-saisi"

REGISTERED = sorted(admin.site._registry.items(), key=lambda item: item[0]._meta.label)
REGISTERED_IDS = [model._meta.label for model, _ in REGISTERED]
# Seules écritures autorisées (le reste est verrouillé) : champs modifiables.
WRITABLE_FIELDS = {
    User: {"full_name", "phone", "is_active"},
    PublicPage: {"is_active", "is_published"},
}


def _changelist(model: type[Model]) -> str:
    return reverse(f"admin:{model._meta.app_label}_{model._meta.model_name}_changelist")


def _change(obj: Model) -> str:
    meta = obj._meta
    return reverse(f"admin:{meta.app_label}_{meta.model_name}_change", args=[obj.pk])


@pytest.fixture
def superuser() -> User:
    return User.objects.create_superuser(
        email="root@example.com", password="Pass-123456!"
    )


@pytest.fixture
def staff() -> User:
    return User.objects.create_user(
        email="staff@example.com", password="Pass-123456!", is_staff=True
    )


@pytest.fixture
def root_client(superuser: User) -> Client:
    client = Client()
    client.force_login(superuser)
    return client


@pytest.fixture
def su_request(superuser: User) -> Any:
    request = RequestFactory().get("/admin/")
    request.user = superuser
    return request


# ── Accès ─────────────────────────────────────────────────────────────────────


def test_admin_site_is_mizan_site() -> None:
    assert isinstance(admin.site, MizanAdminSite)


@pytest.mark.parametrize(("model", "model_admin"), REGISTERED, ids=REGISTERED_IDS)
def test_changelist_open_to_superuser(
    root_client: Client, model: type[Model], model_admin: Any
) -> None:
    assert root_client.get(_changelist(model)).status_code == 200


@pytest.mark.parametrize(("model", "model_admin"), REGISTERED, ids=REGISTERED_IDS)
def test_changelist_redirects_anonymous(model: type[Model], model_admin: Any) -> None:
    response = Client().get(_changelist(model))
    assert response.status_code == 302
    assert response["Location"].startswith(reverse("admin:login"))


@pytest.mark.parametrize(("model", "model_admin"), REGISTERED, ids=REGISTERED_IDS)
def test_changelist_refuses_staff_without_superuser(
    staff: User, model: type[Model], model_admin: Any
) -> None:
    client = Client()
    client.force_login(staff)
    response = client.get(_changelist(model))
    assert response.status_code == 302
    assert response["Location"].startswith(reverse("admin:login"))


def test_inactive_superuser_is_refused(superuser: User, root_client: Client) -> None:
    User.objects.filter(pk=superuser.pk).update(is_active=False)
    assert root_client.get(reverse("admin:index")).status_code == 302


def test_login_form_refuses_staff_without_superuser(staff: User) -> None:
    client = Client()
    response = client.post(
        reverse("admin:login"), {"username": staff.email, "password": "Pass-123456!"}
    )
    assert response.status_code == 200
    assert "_auth_user_id" not in client.session


def test_login_form_accepts_superuser(superuser: User) -> None:
    client = Client()
    response = client.post(
        reverse("admin:login"),
        {"username": superuser.email, "password": "Pass-123456!"},
    )
    assert response.status_code == 302
    assert client.session["_auth_user_id"] == str(superuser.pk)


# ── Enregistrements et navigation ─────────────────────────────────────────────


@pytest.mark.parametrize("model", [OutstandingToken, BlacklistedToken, Group])
def test_never_registered(model: type[Model]) -> None:
    # La fiche d'OutstandingToken afficherait le jeton de rafraîchissement en clair.
    assert not admin.site.is_registered(model)


def test_every_registered_model_has_a_domain() -> None:
    grouped = {label for _, _, entries in DOMAINS for label, _ in entries}
    assert set(REGISTERED_IDS) == grouped


def test_index_lists_domains_in_order(root_client: Client) -> None:
    app_list = root_client.get(reverse("admin:index")).context["app_list"]
    assert [group["name"] for group in app_list] == [title for _, title, _ in DOMAINS]


def test_app_index_keeps_native_app(root_client: Client) -> None:
    response = root_client.get(reverse("admin:app_list", args=["orders"]))
    assert response.status_code == 200
    assert [app["app_label"] for app in response.context["app_list"]] == ["orders"]


# ── Verrouillages ─────────────────────────────────────────────────────────────


LOCKED = [
    (m, ma)
    for m, ma in REGISTERED
    if m not in WRITABLE_FIELDS and m is not AccessAttempt
]


@pytest.mark.parametrize(
    ("model", "model_admin"), LOCKED, ids=[m._meta.label for m, _ in LOCKED]
)
def test_locked_model_has_no_write_permission(
    su_request: Any, model: type[Model], model_admin: Any
) -> None:
    assert not model_admin.has_add_permission(su_request)
    assert not model_admin.has_change_permission(su_request)
    assert not model_admin.has_delete_permission(su_request)


@pytest.mark.parametrize(("model", "model_admin"), REGISTERED, ids=REGISTERED_IDS)
def test_inlines_are_locked(
    su_request: Any, model: type[Model], model_admin: Any
) -> None:
    for inline_class in model_admin.inlines:
        inline = inline_class(model, admin.site)
        assert not inline.has_add_permission(su_request, None)
        assert not inline.has_change_permission(su_request, None)
        assert not inline.has_delete_permission(su_request, None)


@pytest.mark.parametrize("model", list(WRITABLE_FIELDS))
def test_writable_model_exposes_only_allowed_fields(
    su_request: Any, model: type[Model]
) -> None:
    model_admin = admin.site._registry[model]
    obj = UserFactory() if model is User else PublicPageFactory()
    assert not model_admin.has_add_permission(su_request)
    assert not model_admin.has_delete_permission(su_request, obj)
    form = model_admin.get_form(su_request, obj, change=True)
    assert set(form.base_fields) == WRITABLE_FIELDS[model]


def test_access_attempt_can_only_be_deleted(su_request: Any) -> None:
    model_admin = admin.site._registry[AccessAttempt]
    assert not model_admin.has_add_permission(su_request)
    assert not model_admin.has_change_permission(su_request)
    assert model_admin.has_delete_permission(su_request)


def test_zakat_admins_show_no_amount(su_request: Any) -> None:
    amounts = {
        "cash_amount",
        "stock_sale_value",
        "stock_purchase_value",
        "stock_extra",
        "receivable_items",
        "other_assets",
        "debt_items",
        "choices_snapshot",
        "paid_amount",
        "collected_amount",
        "last_paid_amount",
        "nisab_unit_price",
        "ownership_share",
        "doubtful_option",
    }
    for model, model_admin in REGISTERED:
        if model._meta.app_label == "zakat":
            shown = set(model_admin.get_fields(su_request)) | set(
                model_admin.list_display
            )
            assert not shown & amounts, model._meta.label


# ── Données jamais affichées ──────────────────────────────────────────────────


def _populate() -> Shop:
    """Un objet au moins par modèle enregistré, autour d'une boutique avec IBAN."""
    shop = ShopFactory(
        invoice_iban=IBAN, invoice_bic=BIC, invoice_payment_methods=["transfer"]
    )
    owner = ShopMemberFactory(shop=shop).user
    variant = ProductVariantFactory(product__shop=shop)
    item = OrderItemFactory(order=OrderFactory(shop=shop), variant=variant)
    issue_invoice_from_order(shop=shop, order=item.order)
    StockMovementFactory(variant=item.variant, created_by=owner)  # + AuditLog (signal)
    LoyaltyProgramFactory(shop=shop)
    LoyaltyTransactionFactory(card__shop=shop, card__customer=item.order.customer)
    NoteFactory(shop=shop, author=owner)
    ReminderFactory(shop=shop, author=owner)
    ReminderSettingsFactory(shop=shop)
    PreparedMessageFactory(shop=shop, customer=item.order.customer)
    MessageSettingsFactory(shop=shop)
    page = PublicPageFactory(shop=shop)
    PublicPageSectionFactory(page=page)
    PublicCatalogVisibilityFactory(page=page, product=item.variant.product)
    ContactButtonFactory(page=page)
    OcrResultFactory(shop=shop, raw_text=OCR_TEXT, structured_data={"texte": OCR_TEXT})
    SupplierLineMatchFactory(variant=item.variant, created_by=owner)
    ProductScanUsageFactory(shop=shop)
    SubscriptionFactory(shop=shop)
    StripeEvent.objects.create(
        id="evt_admin", event_type="invoice.paid", stripe_created_at=timezone.now()
    )
    ZakatProfileFactory(shop=shop, user=owner)
    ZakatReceivableFollowUpFactory(calculation__shop=shop, calculation__user=owner)
    axes_fields = {
        "username": owner.email,
        "ip_address": "10.0.0.1",
        "user_agent": "test",
        "http_accept": "*/*",
        "path_info": "/",
    }
    AccessAttempt.objects.create(
        **axes_fields, get_data="", post_data=AXES_POST, failures_since_start=1
    )
    AccessLog.objects.create(**axes_fields)
    AccessFailureLog.objects.create(**axes_fields, locked_out=False)
    return shop


def _assert_hidden(response: HttpResponse, secrets: list[str]) -> None:
    assert response.status_code == 200, response.request["PATH_INFO"]
    content = response.content.decode()
    for secret in secrets:
        assert secret not in content, (secret, response.request["PATH_INFO"])


def test_sensitive_data_never_shown(root_client: Client) -> None:
    shop = _populate()
    assert IBAN in str(shop.invoices.get().presentation)  # le snapshot le contient bien
    owner = shop.members.get().user
    secrets = [IBAN, BIC, OCR_TEXT, AXES_POST, owner.password]
    for model, _ in REGISTERED:
        assert model._default_manager.exists(), model._meta.label
        _assert_hidden(root_client.get(_changelist(model)), secrets)
        for obj in model._default_manager.all()[:3]:
            _assert_hidden(root_client.get(_change(obj)), secrets)


# ── Écritures tracées ─────────────────────────────────────────────────────────


def _form_data(response: HttpResponse) -> dict[str, Any]:
    """Données qu'enverrait le navigateur : champs du formulaire et des inlines."""
    form = response.context["adminform"].form
    data = {
        name: value
        for name, value in form.initial.items()
        if name in form.fields and value is not None and value is not False
    }
    for inline in response.context["inline_admin_formsets"]:
        management = inline.formset.management_form
        data.update(
            {management.add_prefix(k): v for k, v in management.initial.items()}
        )
    return {**data, "_save": "Enregistrer"}


def test_user_deactivation_is_audited_and_cuts_api(
    root_client: Client, superuser: User
) -> None:
    member = ShopMemberFactory()
    user = member.user
    refresh = RefreshToken.for_user(user)
    api = APIClient()
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
    assert api.get(reverse("auth-me")).status_code == 200

    data = _form_data(root_client.get(_change(user)))
    data.pop("is_active")  # case décochée
    assert root_client.post(_change(user), data).status_code == 302

    user.refresh_from_db()
    assert not user.is_active
    log = AuditLog.objects.get(action="user_deactivated")
    assert (log.shop_id, log.user, log.object_id) == (
        member.shop_id,
        superuser,
        str(user.pk),
    )
    assert log.changes == {"is_active": [True, False], "revoked_refresh_tokens": 1}
    assert LogEntry.objects.filter(object_id=str(user.pk)).exists()
    # Accès coupé tout de suite : jeton d'accès et rafraîchissement refusés.
    assert api.get(reverse("auth-me")).status_code == 401
    refreshed = APIClient().post(
        reverse("auth-token-refresh"), {"refresh": str(refresh)}
    )
    assert refreshed.status_code == 401


def test_reactivation_does_not_revive_old_refresh_token(superuser: User) -> None:
    user = ShopMemberFactory().user
    refresh = RefreshToken.for_user(user)
    set_user_active(user=user, is_active=False, actor=superuser)
    set_user_active(user=user, is_active=True, actor=superuser)

    assert AuditLog.objects.filter(action="user_reactivated").exists()
    refreshed = APIClient().post(
        reverse("auth-token-refresh"), {"refresh": str(refresh)}
    )
    assert refreshed.status_code == 401


def test_account_without_shop_is_audited_under_no_shop_id(superuser: User) -> None:
    user = UserFactory(full_name="Nadia Test", phone="+33600000000")
    set_user_active(user=user, is_active=False, actor=superuser)

    log = AuditLog.objects.get(action="user_deactivated")
    assert log.shop_id == NO_SHOP_ID == uuid.UUID(int=0)
    # Aucune donnée personnelle du compte : il n'y figure que par son identifiant.
    entry = f"{log.object_repr} {log.changes}"
    for personal in (user.email, user.full_name, user.phone):
        assert personal not in entry
    assert log.object_id == str(user.pk)


def test_user_name_change_is_not_an_activation_event(root_client: Client) -> None:
    user = ShopMemberFactory().user
    data = {**_form_data(root_client.get(_change(user))), "full_name": "Nouveau nom"}
    assert root_client.post(_change(user), data).status_code == 302
    assert not AuditLog.objects.filter(model_name="User").exists()


def test_public_page_moderation_is_audited(
    root_client: Client, superuser: User
) -> None:
    page = PublicPageFactory(is_active=True, is_published=True)
    PublicPageSectionFactory(page=page)
    data = _form_data(root_client.get(_change(page)))
    data.pop("is_published")
    assert root_client.post(_change(page), data).status_code == 302

    page.refresh_from_db()
    assert (page.is_active, page.is_published) == (True, False)
    log = AuditLog.objects.get(action="public_page_moderated")
    assert (log.shop_id, log.user) == (page.shop_id, superuser)
    assert log.changes == {"is_published": [True, False]}
    assert LogEntry.objects.filter(object_id=str(page.pk)).exists()
