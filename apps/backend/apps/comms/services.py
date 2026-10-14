"""Préparation de messages WhatsApp côté serveur.

L'envoi n'est jamais automatique : le service rend le texte d'un modèle à partir d'un
contexte (commande, client), stocke éventuellement un `PreparedMessage`, et le
commerçant ouvre WhatsApp via wa.me pour envoyer lui-même.

`render` est le seul rendu des modèles : relance de l'accueil, des fiches et des
rappels, messages d'une commande, aperçu des réglages.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from decimal import Decimal
from typing import TYPE_CHECKING
from zoneinfo import ZoneInfo

from babel.dates import format_date
from babel.lists import format_list
from babel.numbers import format_currency
from django.db import transaction
from django.utils import timezone

from apps.customers.models import Customer
from apps.orders.models import Order
from apps.orders.services import filter_due

from .message_texts import DEFAULT_TEXTS, SAMPLE
from .models import MessageSettings, PreparedMessage

if TYPE_CHECKING:
    from apps.accounts.models import User
    from apps.shops.models import Shop

TemplateType = PreparedMessage.TemplateType

# Modèles modifiables dans les réglages, dans l'ordre de la page.
TEMPLATE_KEYS: tuple[str, ...] = (
    TemplateType.ORDER_CONFIRMATION,
    TemplateType.TRACKING,
    TemplateType.UNPAID_FOLLOWUP,
    TemplateType.THANK_YOU,
    TemplateType.PROMO,
)
VARIABLES: tuple[str, ...] = (
    'client', 'commande', 'date', 'total', 'reste', 'articles', 'boutique',
)
LANGUAGES: tuple[str, ...] = ('fr', 'en', 'ar')
MAX_TEXT_LENGTH = 2000

_VARIABLE_RE = re.compile(r'\{([^{}]*)\}')


def isolate_number(value: str) -> str:
    """Numéro de commande isolé du sens du texte (U+2066 … U+2069), comme côté frontend."""  # noqa: E501
    return f'⁦{value}⁩'


def resolve_language(lang: str | None, user: User | None = None) -> str:
    """Langue du message : demandée par le client, sinon celle de l'utilisateur."""
    for candidate in (lang, getattr(user, 'language', None)):
        if candidate in LANGUAGES:
            return candidate
    return 'fr'


def get_message_settings(shop: Shop) -> MessageSettings:
    settings, _ = MessageSettings.objects.get_or_create(shop=shop)
    return settings


def default_text(shop: Shop, template: str, tone: str, lang: str) -> str:
    """Texte par défaut d'un modèle ; « Commande prête / remise » selon le mode de retrait."""  # noqa: E501
    key = template
    if template == TemplateType.TRACKING and shop.fulfillment_mode == 'delivery':
        key = 'tracking_delivery'
    if template == TemplateType.FREE:
        key = 'greeting'
    return DEFAULT_TEXTS[lang][tone][key]


def default_texts(shop: Shop, lang: str) -> dict[str, dict[str, str]]:
    """Textes par défaut des modèles modifiables, pour chaque ton."""
    return {
        tone: {key: default_text(shop, key, tone, lang) for key in TEMPLATE_KEYS}
        for tone in MessageSettings.Tone.values
    }


def template_text(
    shop: Shop, settings: MessageSettings, template: str, lang: str,
) -> str:
    """Texte personnalisé du modèle, sinon celui du ton choisi."""
    custom = (settings.custom_texts or {}).get(template)
    return custom or default_text(shop, template, settings.tone, lang)


def unknown_variables(text: str) -> list[str]:
    """Variables `{…}` du texte qui ne font pas partie des variables permises."""
    seen: list[str] = []
    for name in _VARIABLE_RE.findall(text):
        if name not in VARIABLES and name not in seen:
            seen.append(name)
    return seen


@dataclass
class MessageContext:
    """Données d'un message, issues d'une ou plusieurs commandes, ou de l'exemple fictif."""  # noqa: E501

    customer_name: str = ''
    customer_first_name: str = ''
    order_numbers: list[str] = field(default_factory=list)
    date: datetime | None = None
    total: Decimal | None = None
    due: Decimal | None = None
    items: list[str] = field(default_factory=list)


def _first_name(customer: Customer) -> str:
    if customer.first_name.strip():
        return customer.first_name.strip()
    parts = customer.display_name.split()
    return parts[0] if parts else ''


def context_for(customer: Customer | None, orders: list[Order]) -> MessageContext:
    """Contexte d'un client et de ses commandes : montants additionnés, date la plus ancienne."""  # noqa: E501
    ctx = MessageContext()
    if customer is not None:
        ctx.customer_name = customer.display_name
        ctx.customer_first_name = _first_name(customer)
    if orders:
        ctx.order_numbers = [o.order_number for o in orders]
        ctx.date = min(o.created_at for o in orders)
        ctx.total = sum((o.total_amount for o in orders), Decimal('0'))
        ctx.due = sum((o.total_amount - o.amount_paid for o in orders), Decimal('0'))
        ctx.items = [str(item) for o in orders for item in o.items.all()]
    return ctx


def sample_context(shop: Shop, lang: str) -> MessageContext:
    """Exemple fictif de l'aperçu : commande d'hier, 44,97 dans la devise de la boutique."""  # noqa: E501
    sample = SAMPLE[lang]
    name = str(sample['customer'])
    now = timezone.now()
    return MessageContext(
        customer_name=name,
        customer_first_name=name.split()[0],
        order_numbers=[f'{now.astimezone(ZoneInfo(shop.timezone)).year}-054'],
        date=now - timedelta(days=1),
        total=Decimal('44.97'),
        due=Decimal('44.97'),
        items=list(sample['items']),  # type: ignore[call-overload]
    )


def _money(amount: Decimal, shop: Shop, lang: str) -> str:
    return format_currency(amount, shop.currency, locale=lang, numbering_system='latn')


def _date(value: datetime, shop: Shop, lang: str) -> str:
    tz = ZoneInfo(shop.timezone)
    local = value.astimezone(tz).date()
    same_year = local.year == timezone.now().astimezone(tz).year
    return format_date(local, 'd MMM' if same_year else 'd MMM y', locale=lang)


def variables_for(
    shop: Shop, tone: str, lang: str, ctx: MessageContext,
) -> dict[str, str]:
    """Valeur de chaque variable ; vide quand le contexte ne la fournit pas."""
    professional = tone == MessageSettings.Tone.PROFESSIONAL
    return {
        'client': ctx.customer_name if professional else ctx.customer_first_name,
        'commande': (
            format_list([isolate_number(n) for n in ctx.order_numbers], locale=lang)
            if ctx.order_numbers else ''
        ),
        'date': _date(ctx.date, shop, lang) if ctx.date else '',
        'total': _money(ctx.total, shop, lang) if ctx.total is not None else '',
        'reste': _money(ctx.due, shop, lang) if ctx.due is not None else '',
        'articles': format_list(ctx.items, locale=lang) if ctx.items else '',
        'boutique': shop.name,
    }


def render(text: str, values: dict[str, str]) -> str:
    """Remplace les variables connues ; une variable vide emporte l'espace d'avant.

    Une variable inconnue reste telle quelle (visible dans l'aperçu).
    """
    def replace(match: re.Match[str]) -> str:
        name = match.group(2)
        if name not in values:
            return match.group(0)
        value = values[name]
        return f'{match.group(1)}{value}' if value else ''

    rendered = re.sub(r'( ?)\{([^{}]*)\}', replace, text)
    lines = [line.rstrip() for line in rendered.split('\n')]
    return re.sub(r'\n{3,}', '\n\n', '\n'.join(lines)).strip()


def suggest_template(shop: Shop, order: Order) -> str:
    """Modèle adapté à l'étape de la commande et au mode de retrait de la boutique."""
    if order.status == 'cancelled':
        return TemplateType.FREE
    if shop.fulfillment_mode == 'delivery':
        if order.status == 'shipped':
            return TemplateType.TRACKING
        return TemplateType.ORDER_CONFIRMATION
    if order.status == 'to_prepare':
        return TemplateType.ORDER_CONFIRMATION
    if order.status == 'prepared':
        return TemplateType.TRACKING
    if order.payment_status == 'paid':
        return TemplateType.THANK_YOU
    return TemplateType.UNPAID_FOLLOWUP


def compose(
    *,
    shop: Shop,
    lang: str,
    template: str | None = None,
    order: Order | None = None,
    customer: Customer | None = None,
) -> tuple[str, str]:
    """Texte d'un message, prêt à envoyer : `(template_type, message)`.

    - Une commande : modèle demandé, sinon celui de son étape (`suggest_template`).
    - Un client sans commande : relance de toutes ses commandes dues s'il en a,
      sinon une salutation (`free`). `order` et `customer` doivent appartenir à `shop`.
    """
    orders: list[Order] = []
    if order is not None:
        customer = customer or order.customer
        template = template or suggest_template(shop, order)
        orders = [order]
    elif customer is not None and template in (None, TemplateType.UNPAID_FOLLOWUP):
        orders = list(
            filter_due(Order.objects.filter(shop=shop, customer=customer))
            .order_by('created_at')
            .prefetch_related('items')
        )
        template = TemplateType.UNPAID_FOLLOWUP if orders else TemplateType.FREE
    template = template or TemplateType.FREE

    settings = get_message_settings(shop)
    text = template_text(shop, settings, template, lang)
    values = variables_for(shop, settings.tone, lang, context_for(customer, orders))
    return template, render(text, values)


def preview(*, shop: Shop, text: str, lang: str, tone: str | None = None) -> dict[str, object]:  # noqa: E501
    """Rendu d'un texte sur la dernière commande de la boutique, ou sur l'exemple fictif."""  # noqa: E501
    settings = get_message_settings(shop)
    order = (
        Order.objects.filter(shop=shop, customer__isnull=False)
        .select_related('customer')
        .prefetch_related('items')
        .order_by('-created_at')
        .first()
    )
    ctx = context_for(order.customer, [order]) if order else sample_context(shop, lang)
    values = variables_for(shop, tone or settings.tone, lang, ctx)
    return {
        'message': render(text, values),
        'order_number': ctx.order_numbers[0],
        'customer_name': ctx.customer_name,
        'is_sample': order is None,
        'unknown_variables': unknown_variables(text),
    }


@transaction.atomic
def update_message_settings(
    settings: MessageSettings, *, tone: str | None, texts: dict[str, str | None] | None,
) -> MessageSettings:
    """Ton et textes personnalisés ; `None` rétablit le texte du ton choisi."""
    if tone is not None:
        settings.tone = tone
    if texts is not None:
        merged = dict(settings.custom_texts or {})
        for key, value in texts.items():
            if value is None:
                merged.pop(key, None)
            else:
                merged[key] = value
        settings.custom_texts = merged
    settings.save()
    return settings


@transaction.atomic
def prepare_message(
    *,
    shop: Shop,
    user: User,
    template_type: str,
    context_type: str = PreparedMessage.ContextType.NONE,
    context_id=None,
    customer: Customer | None = None,
    custom_message: str | None = None,
    sent: bool = False,
) -> PreparedMessage:
    """Crée un `PreparedMessage` pour la boutique.

    - Résout le contexte (commande / client) en vérifiant l'appartenance
      à la boutique. Toute tentative cross-tenant est traitée comme un 404 métier.
    - Si `custom_message` est fourni, il prime sur le modèle rendu.
    - Pour `template_type=free`, `custom_message` est obligatoire.
    - `sent` : WhatsApp vient de s'ouvrir avec ce texte, le message est enregistré
      directement comme envoyé (historique des fiches client et commande).
    """
    order: Order | None = None

    if context_type == PreparedMessage.ContextType.ORDER and context_id:
        order = Order.objects.filter(shop=shop, id=context_id).select_related('customer').first()  # noqa: E501
        if order is None:
            raise ValueError('Commande introuvable.')
        if customer is None:
            customer = order.customer
    elif context_type == PreparedMessage.ContextType.CUSTOMER and context_id and customer is None:  # noqa: E501
        customer = Customer.objects.filter(shop=shop, id=context_id).first()
        if customer is None:
            raise ValueError('Client introuvable.')

    if customer is not None and customer.shop_id != shop.id:
        raise ValueError('Client introuvable.')

    if custom_message and custom_message.strip():
        message = custom_message.strip()
    elif template_type == TemplateType.FREE:
        raise ValueError('Message libre : le contenu est requis.')
    else:
        _, message = compose(
            shop=shop, lang=resolve_language(None, user), template=template_type,
            order=order, customer=customer,
        )

    return PreparedMessage.objects.create(
        shop=shop,
        customer=customer,
        template_type=template_type,
        context_type=context_type,
        context_id=context_id,
        recipient_name=customer.display_name if customer else '',
        recipient_phone=customer.phone if customer else '',
        message=message,
        status=(
            PreparedMessage.Status.SENT_MANUALLY if sent
            else PreparedMessage.Status.PREPARED
        ),
        sent_manually_at=timezone.now() if sent else None,
    )
