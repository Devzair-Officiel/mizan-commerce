"""Facture liée à une commande : paiement et annulation propagés (URS-110, URS-112)."""

import logging
from datetime import datetime
from decimal import Decimal

from django.db.models import Case, F, QuerySet, Value, When
from django.db.models.functions import Least
from django.utils import timezone

from apps.orders.models import Order

from .models import FULLY_CREDITED, Invoice

logger = logging.getLogger(__name__)


def sync_invoice_from_order(order: Order) -> None:
    """Aligne la facture liée sur la commande, en une seule écriture SQL.

    Règles, par priorité :
    1. Commande annulée → facture annulée, sauf facture créditée : l'avoir l'a
       déjà corrigée, elle reste telle quelle et le cas est journalisé. Jamais
       d'erreur : l'annulation de la commande doit aboutir.
    2. Commande payée intégralement → facture payée ; entièrement créditée, elle
       reste émise (« Créditée »).
    3. Commande non payée ou partielle → facture émise.

    Le règlement est plafonné au net dû (TTC − avoirs), calculé par PostgreSQL
    sur la ligne verrouillée par l'écriture : un avoir émis en même temps est
    pris en compte. Une facture annulée (état terminal légal) ne change plus.
    Appelée depuis `orders.services` après tout changement de paiement ou
    d'annulation.
    """
    invoices = Invoice.objects.filter(
        shop_id=order.shop_id,
        order=order,
        kind=Invoice.KIND_INVOICE,
        status__in=(Invoice.STATUS_ISSUED, Invoice.STATUS_PAID),
    )
    now = timezone.now()
    received = Least(
        Value(Decimal(str(order.amount_paid or 0))),
        F('total_ttc') - F('credited_total'),
    )
    if order.status == 'cancelled':
        _cancel(invoices, order, received, now)
    elif order.payment_status == 'paid':
        invoices.update(
            amount_paid=received,
            status=Case(
                When(FULLY_CREDITED, then=Value(Invoice.STATUS_ISSUED)),
                default=Value(Invoice.STATUS_PAID),
            ),
            # Valeurs d'avant l'écriture : une facture déjà payée garde sa date.
            paid_at=Case(
                When(FULLY_CREDITED, then=Value(None)),
                When(status=Invoice.STATUS_PAID, then=F('paid_at')),
                default=Value(now),
            ),
            updated_at=now,
        )
    else:
        invoices.update(
            amount_paid=received,
            status=Invoice.STATUS_ISSUED,
            paid_at=None,
            updated_at=now,
        )


def _cancel(invoices: QuerySet, order: Order, received: Least, now: datetime) -> None:
    cancelled = invoices.filter(credited_total=0).update(
        status=Invoice.STATUS_CANCELLED,
        amount_paid=received,
        cancelled_at=now,
        updated_at=now,
    )
    if not cancelled and invoices.filter(credited_total__gt=0).exists():
        logger.warning(
            'Commande %s annulée : facture créditée laissée inchangée (boutique %s).',
            order.pk,
            order.shop_id,
        )
