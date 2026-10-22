"""Socle des exports : un seul jeu de données, trois rendus (CSV, PDF, WhatsApp).

App sans modèle : les données viennent des apps métier (commandes ici, stock dans
`stock_dataset`) et chaque export est consigné dans `core.AuditLog` ; les tests
s'appuient sur les factories existantes (boutiques, commandes, formules).

Un jeu de données porte un titre, une période (phrase), les filtres actifs, des
colonnes typées, des lignes lues à la demande et des totaux en `Decimal`. Les
rendus (`render_csv`, `render_pdf`, `render_whatsapp`) ne recalculent rien.
"""

from __future__ import annotations

from collections.abc import Iterable, Iterator
from dataclasses import dataclass, field, replace
from datetime import date, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from babel.dates import format_date
from django.db.models import Count, DecimalField, F, QuerySet, Sum, Value
from django.db.models.functions import Greatest
from django.utils import timezone
from django.utils.text import slugify

from apps.accounts.models import User
from apps.core.models import AuditLog
from apps.customers.models import Customer
from apps.customers.services import format_phone_display, local_period
from apps.orders.filters import annotate_ranks
from apps.orders.models import Order
from apps.orders.services import filter_orders
from apps.shops.models import Shop

from .texts import LANGUAGES, TEXTS, status_label

TEXT, DATETIME, MONEY, COUNT = 'text', 'datetime', 'money', 'count'
# Quantité de stock (3 décimales, signée) : nombre, jamais neutralisé comme formule.
QUANTITY = 'quantity'
FORMATS = ('csv', 'pdf', 'whatsapp')
PDF_LANGUAGES = ('fr', 'en')
# Au-delà, le PDF est refusé et la fenêtre propose le CSV.
PDF_MAX_ROWS = 1000
# Lignes détaillées dans le message ; la suite renvoie au PDF.
WHATSAPP_MAX_ROWS = 15
ZERO = Decimal('0')


class TooManyRows(Exception):
    """Export PDF au-delà de `PDF_MAX_ROWS` lignes."""


@dataclass(frozen=True)
class ExportColumn:
    key: str
    kind: str
    # Repris dans le PDF et le message ; le CSV garde toutes les colonnes.
    compact: bool = False
    # Largeur dans le PDF (points), mesurée sur les libellés ; `None` : les
    # colonnes sans largeur se partagent le reste.
    width: float | None = None
    # Passe à la ligne dans le PDF (Paragraph) ; sinon texte brut, plus rapide.
    wrap: bool = False


@dataclass(frozen=True)
class ExportRow:
    values: dict[str, str | Decimal | datetime | None]
    # Ligne affichée mais hors totaux (commande annulée).
    excluded: bool = False


@dataclass(frozen=True)
class ExportTotal:
    key: str
    kind: str
    value: int | Decimal


@dataclass(frozen=True)
class ExportDataset:
    shop: Shop
    lang: str
    # Famille du jeu (`orders`, `stock`, `statement`) : ligne et renvoi du message.
    kind: str
    title: str
    filename_stem: str
    period: str
    generated_at: datetime
    columns: tuple[ExportColumn, ...]
    rows: Iterable[ExportRow]
    row_count: int
    totals: tuple[ExportTotal, ...]
    totals_note: str = ''
    empty: str = ''
    filters: tuple[str, ...] = field(default_factory=tuple)
    # Destinataire (relevé d'un client) : nom, puis coordonnées, sous le titre.
    subject: tuple[str, ...] = field(default_factory=tuple)
    # Date des montants (« Situation au … ») quand ce n'est pas la fin de la période.
    as_of: str = ''

    @property
    def tz(self) -> ZoneInfo:
        return ZoneInfo(self.shop.timezone)

    @property
    def currency(self) -> str:
        return self.shop.currency

    def text(self, key: str) -> str:
        return TEXTS[self.lang][key]

    @property
    def filename_date(self) -> str:
        return self.generated_at.date().isoformat()


def export_language(lang: str | None, user: User, export_format: str) -> str:
    """Langue de l'interface, sinon celle du compte, sinon le français.

    Le PDF n'existe qu'en français et en anglais : l'arabe le reçoit en français,
    comme les factures (dette « PDF en arabe »).
    """
    code = next((c for c in (lang, user.language) if c in LANGUAGES), 'fr')
    if export_format == 'pdf' and code not in PDF_LANGUAGES:
        return 'fr'
    return code


def format_day(day: date, lang: str) -> str:
    return format_date(day, 'd MMM y', locale=lang)


def period_text(date_from: date | None, date_to: date | None, lang: str) -> str:
    """Période de création, telle que l'annoncent l'en-tête du PDF et le message."""
    texts = TEXTS[lang]
    if date_from and date_to:
        if date_from == date_to:
            return texts['period.day'].format(day=format_day(date_from, lang))
        return texts['period.range'].format(
            start=format_day(date_from, lang), end=format_day(date_to, lang),
        )
    if date_from:
        return texts['period.from'].format(start=format_day(date_from, lang))
    if date_to:
        return texts['period.to'].format(end=format_day(date_to, lang))
    return texts['period.all']


# ── Commandes ────────────────────────────────────────────────────────────────

# Largeurs PDF mesurées au corps 8,25 avec des marges de 5 ; le client prend le reste.
ORDER_COLUMNS = (
    ExportColumn('number', TEXT, compact=True, width=54),
    ExportColumn('created_at', DATETIME, compact=True, width=56),
    ExportColumn('customer', TEXT, compact=True, wrap=True),
    ExportColumn('status', TEXT, compact=True, width=80, wrap=True),
    ExportColumn('payment', TEXT, compact=True, width=56),
    ExportColumn('subtotal', MONEY),
    ExportColumn('discount', MONEY),
    ExportColumn('shipping', MONEY),
    ExportColumn('total', MONEY, compact=True, width=60),
    ExportColumn('paid', MONEY, compact=True, width=60),
    ExportColumn('due', MONEY, compact=True, width=60),
    ExportColumn('overpaid', MONEY),
)


@dataclass(frozen=True)
class OrderFilters:
    """Filtres de la page Commandes, déjà validés, plus la période de création."""

    date_from: date | None = None
    date_to: date | None = None
    status: str = ''
    payment_status: str = ''
    due: bool = False
    customer: Customer | None = None
    search: str = ''


def export_orders_queryset(shop: Shop, filters: OrderFilters) -> QuerySet[Order]:
    """Commandes de la boutique, filtres de la page et période (date de création).

    La recherche et le tri restent aux filtres DRF de la vue, comme sur la liste.
    """
    params = {
        'status': filters.status,
        'payment_status': filters.payment_status,
        'due': 'true' if filters.due else '',
        'customer': str(filters.customer.pk) if filters.customer else '',
    }
    qs = annotate_ranks(Order.objects.filter(shop=shop).select_related('customer'))
    qs = filter_orders(qs, shop, params)
    start, end = local_period(shop, filters.date_from, filters.date_to)
    if start:
        qs = qs.filter(created_at__gte=start)
    if end:
        qs = qs.filter(created_at__lt=end)
    return qs


def _floored(expression: F) -> Greatest:
    """`expression` ramenée à zéro si elle est négative, en `Decimal`."""
    money = DecimalField(max_digits=12, decimal_places=2)
    return Greatest(expression, Value(ZERO, output_field=money), output_field=money)


def _order_totals(qs: QuerySet[Order]) -> tuple[ExportTotal, ...]:
    """Nombre, total, encaissé et reste dû, hors commandes annulées.

    Le reste dû additionne celui de chaque commande, jamais négatif : un
    trop-perçu ne réduit pas ce que doivent les autres clients. Les excédents
    forment un total à part, affiché seulement s'il y en a.
    """
    sums = qs.exclude(status='cancelled').order_by().aggregate(
        count=Count('id'), total=Sum('total_amount'), paid=Sum('amount_paid'),
        due=Sum(_floored(F('total_amount') - F('amount_paid'))),
        overpaid=Sum(_floored(F('amount_paid') - F('total_amount'))),
    )
    overpaid = sums['overpaid'] or ZERO
    totals = (
        ExportTotal('count', COUNT, sums['count']),
        ExportTotal('total', MONEY, sums['total'] or ZERO),
        ExportTotal('paid', MONEY, sums['paid'] or ZERO),
        ExportTotal('due', MONEY, sums['due'] or ZERO),
    )
    if overpaid > ZERO:
        totals += (ExportTotal('overpaid', MONEY, overpaid),)
    return totals


def _order_rows(qs: QuerySet[Order], shop: Shop, lang: str) -> Iterator[ExportRow]:
    """Une ligne par commande, lue par paquets.

    Reste dû et trop-perçu jamais négatifs ; vides pour une commande annulée.
    """
    texts = TEXTS[lang]
    for order in qs.iterator(chunk_size=500):
        cancelled = order.status == 'cancelled'
        balance = order.total_amount - order.amount_paid
        customer = order.customer.display_name if order.customer else texts['no_customer']  # noqa: E501
        yield ExportRow(
            values={
                'number': order.order_number,
                'created_at': order.created_at,
                'customer': customer,
                'status': status_label(shop, order.status, lang),
                'payment': texts[f'payment.{order.payment_status}'],
                'subtotal': order.subtotal,
                'discount': order.discount_amount,
                'shipping': order.shipping_amount,
                'total': order.total_amount,
                'paid': order.amount_paid,
                'due': None if cancelled else max(balance, ZERO),
                'overpaid': None if cancelled else max(-balance, ZERO),
            },
            excluded=cancelled,
        )


def _filter_labels(shop: Shop, filters: OrderFilters, lang: str) -> tuple[str, ...]:
    """Filtres actifs, en clair : le PDF et le message disent ce qu'ils contiennent."""
    texts = TEXTS[lang]
    labels = []
    if filters.status:
        labels.append(status_label(shop, filters.status, lang))
    if filters.payment_status:
        labels.append(texts[f'payment.{filters.payment_status}'])
    if filters.due:
        labels.append(texts['filter.due'])
    if filters.customer:
        labels.append(filters.customer.display_name)
    if filters.search:
        labels.append(texts['filter.search'].format(query=filters.search))
    return tuple(labels)


def orders_dataset(
    shop: Shop, qs: QuerySet[Order], filters: OrderFilters, lang: str,
) -> ExportDataset:
    """Jeu de données des commandes `qs` (déjà filtrées et triées par la vue)."""
    texts = TEXTS[lang]
    return ExportDataset(
        shop=shop,
        lang=lang,
        kind='orders',
        title=texts['orders.title'],
        filename_stem=texts['orders.filename'],
        period=period_text(filters.date_from, filters.date_to, lang),
        generated_at=timezone.now().astimezone(ZoneInfo(shop.timezone)),
        columns=ORDER_COLUMNS,
        rows=_order_rows(qs, shop, lang),
        row_count=qs.count(),
        totals=_order_totals(qs),
        totals_note=texts['totals.note'],
        empty=texts['orders.empty'],
        filters=_filter_labels(shop, filters, lang),
    )


# ── Relevé de compte d'un client ─────────────────────────────────────────────

# Le client est dans l'en-tête : pas de colonne Client ; le statut prend le reste.
STATEMENT_COLUMNS = (
    ExportColumn('created_at', DATETIME, compact=True, width=56),
    ExportColumn('number', TEXT, compact=True, width=54),
    ExportColumn('status', TEXT, compact=True, wrap=True),
    ExportColumn('payment', TEXT, compact=True, width=56),
    ExportColumn('total', MONEY, compact=True, width=72),
    ExportColumn('paid', MONEY, compact=True, width=72),
    ExportColumn('due', MONEY, compact=True, width=72),
)


def statement_queryset(shop: Shop, filters: OrderFilters) -> QuerySet[Order]:
    """Commandes du client `filters.customer` créées dans la période, de la plus
    récente à la plus ancienne ; « À encaisser » avec `filters.due`."""
    return export_orders_queryset(shop, filters).order_by('-created_at', '-pk')


def _customer_identity(customer: Customer) -> tuple[str, ...]:
    """Nom, téléphone, e-mail et adresse renseignés du client."""
    phone = format_phone_display(customer.phone)
    city = ' '.join(part for part in (customer.postal_code, customer.city) if part)
    lines = (customer.display_name, phone, customer.email, customer.address_line, city)
    return tuple(line for line in lines if line)


def statement_dataset(
    shop: Shop, qs: QuerySet[Order], filters: OrderFilters, lang: str,
) -> ExportDataset:
    """Relevé de compte : le jeu des commandes `qs` du client, une ligne par
    commande (paiements compris, jamais les notes), son identité en en-tête.

    Encaissé et reste dû sont ceux d'aujourd'hui, pas ceux de la fin de la
    période : l'en-tête le dit (« Situation au … »).
    """
    texts = TEXTS[lang]
    customer = filters.customer
    dataset = orders_dataset(shop, qs, filters, lang)
    slug = slugify(customer.display_name, allow_unicode=True) or 'client'
    return replace(
        dataset,
        kind='statement',
        title=texts['statement.title'],
        filename_stem=f"{texts['statement.filename']}-{slug}",
        columns=STATEMENT_COLUMNS,
        empty=texts['statement.empty.due' if filters.due else 'statement.empty'],
        # Le client est déjà dans l'en-tête.
        filters=_filter_labels(shop, replace(filters, customer=None), lang),
        subject=_customer_identity(customer),
        as_of=texts['statement.as_of'].format(
            date=dataset.generated_at.strftime('%d/%m/%Y'),
        ),
    )


def log_statement_export(
    dataset: ExportDataset, *, user: User, export_format: str, filters: OrderFilters,
) -> AuditLog:
    """Même journal que le CSV de l'activité (`customer_activity_export`), avec
    le format : période, « À encaisser » et nombre de lignes."""
    customer = filters.customer
    return AuditLog.objects.create(
        shop_id=dataset.shop.id, user=user, action='customer_activity_export',
        model_name='Customer', object_id=str(customer.id),
        object_repr=customer.display_name[:200],
        changes={
            'format': export_format,
            'pending': filters.due,
            'rows': dataset.row_count,
            'from': filters.date_from.isoformat() if filters.date_from else None,
            'to': filters.date_to.isoformat() if filters.date_to else None,
        },
    )


def check_row_limit(dataset: ExportDataset, export_format: str) -> None:
    """Le PDF s'arrête à `PDF_MAX_ROWS` lignes : au-delà, le CSV."""
    if export_format == 'pdf' and dataset.row_count > PDF_MAX_ROWS:
        raise TooManyRows


def log_orders_export(
    dataset: ExportDataset, *, user: User, export_format: str, filters: OrderFilters,
) -> AuditLog:
    """Une ligne `orders_export` par export (famille `data.export`), ciblant la
    boutique : format, période, filtres et nombre de lignes."""
    shop = dataset.shop
    return AuditLog.objects.create(
        shop_id=shop.id, user=user, action='orders_export',
        model_name='Shop', object_id=str(shop.id), object_repr=shop.name[:200],
        changes={
            'format': export_format,
            'rows': dataset.row_count,
            'from': filters.date_from.isoformat() if filters.date_from else None,
            'to': filters.date_to.isoformat() if filters.date_to else None,
            'status': filters.status or None,
            'payment_status': filters.payment_status or None,
            'due': filters.due,
            'customer': str(filters.customer.pk) if filters.customer else None,
            'search': bool(filters.search),
        },
    )
