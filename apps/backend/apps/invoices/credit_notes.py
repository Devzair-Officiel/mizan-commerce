"""Avoirs (URS-112) : correction d'une facture émise, totale ou partielle.

Un avoir est une `Invoice` de type `credit_note`, créée directement émise
(`issued`, terminal : jamais payé ni annulé) ; montants positifs, signe négatif
à l'affichage et dans les agrégats (spec §12 D1 à D10). Ses instantanés vendeur,
acheteur, présentation et taux de TVA sont copiés de la facture d'origine.

Avoir partiel : quantités à la baisse, ligne par ligne ; remise au prorata des
lignes créditées, livraison au choix. L'avoir qui solde une ligne, la remise ou
la facture crédite exactement le reste : aucun écart d'arrondi ne s'accumule.

Un avoir ne touche jamais au stock ni à la commande liée.
"""

from collections.abc import Collection, Mapping, Sequence
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo

from django.db import transaction
from django.db.models import F, Sum
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError

from apps.core.audit import log_action
from apps.shops.models import Shop

from .compliance import ComplianceIssue
from .drafts import BUYER_FIELDS, SELLER_FIELDS, ComplianceError
from .models import DocumentSequence, Invoice, InvoiceLine
from .services import _next_number

CENT = Decimal('0.01')
ZERO = Decimal('0')
CREDITABLE = (Invoice.STATUS_ISSUED, Invoice.STATUS_PAID)
TOTAL_FIELDS = (
    'subtotal_ht',
    'discount_amount',
    'shipping_amount',
    'tax_amount',
    'total_ttc',
)
# Champs repris tels quels de la facture d'origine.
COPIED_FIELDS = (
    'operation_category',
    'currency',
    'tax_rate',
    'customer_id',
    *SELLER_FIELDS,
    *BUYER_FIELDS,
)
# Copiés tels quels sur chaque ligne créditée.
LINE_FIELDS = (
    'description',
    'details',
    'unit',
    'product_name',
    'variant_name',
    'unit_price_ht',
    'position',
)


class CreditNoteError(Exception):
    """Avoir refusé (réponse 409) ; `code` en donne la cause :
    `invoice_draft`, `invoice_cancelled`, `credit_note_of_credit_note`,
    `over_credit` (au-delà du reste à créditer), `nothing_to_credit`."""

    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


@dataclass(frozen=True)
class _Credited:
    """Ce que les avoirs précédents ont déjà crédité sur la facture."""

    totals: dict[str, Decimal]
    # Rang de la ligne d'origine → (quantité, sous-total HT) déjà crédités.
    lines: dict[int, tuple[Decimal, Decimal]]


def _reason(reason: str) -> str:
    reason = reason.strip()
    if not reason:
        raise ValidationError({'reason': 'Indiquez le motif de l’avoir.'})
    return reason


def _lock_invoice(shop: Shop, invoice: Invoice) -> Invoice:
    """Verrous dans l'ordre boutique → facture (puis compteur, à la numérotation).

    NO KEY UPDATE, comme l'émission : sérialise les avoirs d'une même facture
    sans bloquer le contrôle de clé étrangère des insertions.
    """
    shop = Shop.objects.select_for_update(no_key=True).get(pk=shop.pk)
    locked = (
        Invoice.objects.select_for_update(no_key=True)
        .filter(pk=invoice.pk, shop=shop)
        .first()
    )
    if locked is None:
        raise NotFound('Facture introuvable.')
    if locked.kind == Invoice.KIND_CREDIT_NOTE:
        raise CreditNoteError('credit_note_of_credit_note')
    if locked.status == Invoice.STATUS_DRAFT:
        raise CreditNoteError('invoice_draft')
    if locked.status == Invoice.STATUS_CANCELLED:
        raise CreditNoteError('invoice_cancelled')
    locked.shop = shop
    return locked


def check_credit_note(invoice: Invoice) -> list[ComplianceIssue]:
    """Recommandations (facture d'une boutique en France) : l'avoir reprend
    l'instantané vendeur de la facture, ses lacunes comprises."""
    if invoice.seller_country != 'FR':
        return []
    checks = [
        ('seller_address', not invoice.seller_address.strip()),
        (
            'seller_identifier',
            not (invoice.presentation.get('siret') or invoice.seller_tax_id.strip()),
        ),
    ]
    return [
        ComplianceIssue(code, 'recommended', 'invoice_settings')
        for code, missing in checks
        if missing
    ]


def _verify(invoice: Invoice, acknowledged: Collection[str]) -> list[str]:
    issues = check_credit_note(invoice)
    if any(issue.code not in acknowledged for issue in issues):
        raise ComplianceError(issues, blocking=False)
    return [issue.code for issue in issues]


def _already_credited(invoice: Invoice) -> _Credited:
    """Lu sous le verrou de la facture : aucun autre avoir ne s'y ajoute."""
    notes = Invoice.objects.filter(
        shop_id=invoice.shop_id,
        kind=Invoice.KIND_CREDIT_NOTE,
        credited_invoice=invoice,
    )
    sums = notes.aggregate(**{field: Sum(field) for field in TOTAL_FIELDS})
    rows = (
        InvoiceLine.objects.filter(shop_id=invoice.shop_id, invoice__in=notes)
        .values('position')
        .annotate(quantity=Sum('quantity'), subtotal=Sum('line_subtotal_ht'))
    )
    return _Credited(
        totals={field: sums[field] or ZERO for field in TOTAL_FIELDS},
        lines={row['position']: (row['quantity'], row['subtotal']) for row in rows},
    )


def _requested(
    originals: Sequence[InvoiceLine], rows: Sequence[Mapping[str, Any]]
) -> dict[str, Decimal]:
    """Quantité demandée par ligne d'origine (identifiant en clé)."""
    by_id = {str(line.pk): line for line in originals}
    requested: dict[str, Decimal] = {}
    for row in rows:
        key, quantity = str(row['line']), Decimal(row['quantity'])
        if key not in by_id or key in requested:
            raise ValidationError({'lines': 'Ligne inconnue ou en double.'})
        if not ZERO < quantity <= by_id[key].quantity:
            raise ValidationError(
                {'lines': 'Quantité à créditer hors des bornes de la ligne.'}
            )
        requested[key] = quantity
    return requested


def _credited_lines(
    invoice: Invoice,
    rows: Sequence[Mapping[str, Any]] | None,
    done: _Credited,
) -> tuple[list[InvoiceLine], bool]:
    """Lignes de l'avoir (sans document) et `True` si toutes les lignes de la
    facture sont alors entièrement créditées. `rows=None` : tout le reste."""
    originals = list(invoice.lines.all())
    remaining = {
        line.pk: line.quantity - done.lines.get(line.position, (ZERO, ZERO))[0]
        for line in originals
    }
    if rows is None:
        requested = {str(pk): left for pk, left in remaining.items() if left > 0}
    else:
        requested = _requested(originals, rows)
    lines, complete = [], True
    for line in originals:
        quantity = requested.get(str(line.pk))
        if quantity is None:
            complete = complete and remaining[line.pk] == 0
            continue
        if quantity > remaining[line.pk]:
            raise CreditNoteError('over_credit')
        full = quantity == remaining[line.pk]
        complete = complete and full
        done_subtotal = done.lines.get(line.position, (ZERO, ZERO))[1]
        lines.append(
            InvoiceLine(
                shop_id=invoice.shop_id,
                quantity=quantity,
                # Reste exact de la ligne quand elle est soldée.
                line_subtotal_ht=line.line_subtotal_ht - done_subtotal
                if full
                else (line.unit_price_ht * quantity).quantize(CENT),
                **{field: getattr(line, field) for field in LINE_FIELDS},
            )
        )
    return lines, complete


def _amounts(
    invoice: Invoice,
    lines: Sequence[InvoiceLine],
    done: _Credited,
    *,
    complete: bool,
    include_shipping: bool,
) -> dict[str, Decimal]:
    """Totaux de l'avoir. Remise au prorata des lignes créditées, ou son reste
    exact quand toutes les lignes sont soldées ; TVA au taux de la facture, ou
    son reste exact quand l'avoir solde la facture."""
    left = {f: getattr(invoice, f) - done.totals[f] for f in TOTAL_FIELDS}
    subtotal = sum((line.line_subtotal_ht for line in lines), ZERO)
    if complete:
        discount = left['discount_amount']
    elif invoice.subtotal_ht > 0:
        prorata = invoice.discount_amount * subtotal / invoice.subtotal_ht
        discount = min(left['discount_amount'], prorata.quantize(CENT))
    else:
        discount = ZERO
    shipping = left['shipping_amount'] if include_shipping else ZERO
    base = subtotal - discount + shipping
    if complete and shipping == left['shipping_amount']:
        tax = left['tax_amount']
    else:
        tax = (base * invoice.tax_rate / Decimal('100')).quantize(CENT)
    return {
        'subtotal_ht': subtotal,
        'discount_amount': discount,
        'shipping_amount': shipping,
        'tax_amount': tax,
        'total_ttc': base + tax,
    }


def _claim(invoice: Invoice, amount: Decimal, now: datetime) -> None:
    """Plafond atomique : on ne crédite jamais plus que le TTC de la facture."""
    updated = Invoice.objects.filter(
        pk=invoice.pk,
        shop_id=invoice.shop_id,
        kind=Invoice.KIND_INVOICE,
        status__in=CREDITABLE,
        credited_total__lte=F('total_ttc') - amount,
    ).update(credited_total=F('credited_total') + amount, updated_at=now)
    if not updated:
        raise CreditNoteError('over_credit')


def _audit(invoice: Invoice, note: Invoice, user: Any, accepted: list[str]) -> None:
    log_action(
        shop_id=invoice.shop_id,
        user=user,
        action='credit_note_issued',
        model_name='Invoice',
        obj_id=note.pk,
        obj_repr=note.number,
        changes={
            'credited_invoice': invoice.number,
            'total_ttc': str(note.total_ttc),
            'warnings': accepted,
        },
    )


def _presentation(invoice: Invoice, issued_on: date) -> dict:
    """Présentation de la facture, datée de l'avoir et liée à la facture."""
    return {
        **invoice.presentation,
        'issued_date': issued_on.isoformat(),
        'credited_number': invoice.number,
        'credited_issued_date': invoice.presentation.get('issued_date', ''),
        # Un avoir n'a ni échéance ni relevé de compte.
        'show_account_summary': False,
        'account_summary': None,
    }


def _new_credit_note(
    invoice: Invoice, number: str, now: datetime, reason: str, totals: dict
) -> Invoice:
    issued_on = now.astimezone(ZoneInfo(invoice.shop.timezone)).date()
    return Invoice.objects.create(
        shop=invoice.shop,
        kind=Invoice.KIND_CREDIT_NOTE,
        status=Invoice.STATUS_ISSUED,
        credited_invoice=invoice,
        credit_reason=reason,
        number=number,
        issued_at=now,
        presentation=_presentation(invoice, issued_on),
        **{field: getattr(invoice, field) for field in COPIED_FIELDS},
        **totals,
    )


@transaction.atomic
def issue_credit_note(
    shop: Shop,
    invoice: Invoice,
    lines: Sequence[Mapping[str, Any]] | None,
    reason: str,
    user: Any,
    *,
    acknowledged_warnings: Collection[str],
    include_shipping: bool = False,
) -> Invoice:
    """Émet un avoir sur une facture émise ou payée de `shop`.

    `lines=None` : avoir total (tout le reste, livraison comprise). Sinon
    `[{'line': <id de ligne de la facture>, 'quantity': Decimal}]`, livraison
    créditée si `include_shipping`. Tout refus annule la transaction : aucun
    numéro consommé, aucun montant crédité, rien de journalisé. `user` : auteur
    inscrit au journal d'audit (`credit_note_issued`), dans la même transaction.
    """
    reason = _reason(reason)
    invoice = _lock_invoice(shop, invoice)
    accepted = _verify(invoice, acknowledged_warnings)
    done = _already_credited(invoice)
    credited, complete = _credited_lines(invoice, lines, done)
    totals = _amounts(
        invoice,
        credited,
        done,
        complete=complete,
        include_shipping=lines is None or include_shipping,
    )
    if totals['total_ttc'] <= 0:
        raise CreditNoteError('nothing_to_credit')
    now = timezone.now()
    _claim(invoice, totals['total_ttc'], now)
    issued_on = now.astimezone(ZoneInfo(invoice.shop.timezone)).date()
    number = _next_number(invoice.shop, DocumentSequence.KIND_CREDIT_NOTE, issued_on)
    note = _new_credit_note(invoice, number, now, reason, totals)
    for line in credited:
        line.invoice = note
    InvoiceLine.objects.bulk_create(credited)
    _audit(invoice, note, user, accepted)
    return note
