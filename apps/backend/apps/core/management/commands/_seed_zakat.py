"""Seed zakat : fiches personnelles (lot Z1).

- youssef : profil complet (hégirien, seuil or, tous les choix faits) et la fiche de
  l'année hégirienne précédente (1er ramadan), avec une créance liée à une commande
  non réglée, des autres biens et des dettes ; finalisée pour l'écran actuel ;
- amira : profil créé, aucun choix fait ;
- vide@ : rien.
"""
import datetime
from decimal import Decimal

from django.utils import timezone
from hijridate import Hijri

from apps.zakat import hawl
from apps.zakat import services as zakat_services
from apps.zakat.models import ZakatCalculation, ZakatProfile

RAMADAN = 9


def _previous_ramadan(shop) -> datetime.date:
    """1er ramadan de l'année hégirienne précédant celle du jour."""
    year = hawl.to_hijri(zakat_services.shop_today(shop))[0]
    gregorian = Hijri(year - 1, RAMADAN, 1).to_gregorian()
    return datetime.date(gregorian.year, gregorian.month, gregorian.day)


def _seed_youssef_profile(shop, user, hawl_date: datetime.date) -> None:
    profile = zakat_services.get_or_create_profile(shop, user)
    if profile.calendar is not None:
        return
    profile.hawl_date = hawl_date
    profile.calendar = hawl.CALENDAR_HIJRI
    profile.nisab_method = 'gold'
    profile.nisab_unit_price = Decimal('110.00')
    profile.nisab_price_updated_at = timezone.now()
    profile.stock_valuation = ZakatProfile.STOCK_VALUATION_SALE
    profile.receivables_mode = ZakatProfile.RECEIVABLES_YEARLY
    profile.debts_mode = ZakatProfile.DEBTS_WITHIN_12_MONTHS
    profile.save()


def _receivable_items(shop) -> list[dict]:
    unpaid = zakat_services.build_sources(shop)['unpaid_orders']
    items = [
        {
            'order_id': str(order['order_id']),
            'label': f"Commande {order['order_number']}",
            'amount': str(order['remaining']),
            'doubtful': False,
        }
        for order in unpaid[:1]
    ]
    items.append(
        {'order_id': None, 'label': 'Client parti sans payer', 'amount': '180.00', 'doubtful': True},  # noqa: E501
    )
    return items


def _seed_youssef_calculation(shop, user, reference_date: datetime.date) -> None:
    if ZakatCalculation.objects.filter(shop=shop, user=user).exists():
        return
    zakat_services.create_calculation(shop, user, {
        'reference_date': reference_date,
        'current_step': 6,
        'cash_amount': Decimal('12500.00'),
        'stock_extra': Decimal('800.00'),
        'receivable_items': _receivable_items(shop),
        'other_assets': [
            {'category': 'personal_cash', 'label': 'Espèces à la maison', 'amount': '3000.00', 'counted': True},  # noqa: E501
            {'category': 'real_estate', 'label': 'Résidence principale', 'amount': '180000.00', 'counted': False},  # noqa: E501
        ],
        'debt_items': [
            {'category': 'supplier', 'label': 'Facture Lin & Co', 'amount': '1800.00', 'amount_within_12_months': '1800.00'},  # noqa: E501
            {'category': 'loan', 'label': 'Paiement échelonné', 'amount': '6000.00', 'amount_within_12_months': '2400.00'},  # noqa: E501
        ],
    })


def seed_zakat(shop_fr, youssef, shop_ma, amira, stdout) -> None:
    """Profils et fiche zakat des comptes de démo. Idempotent."""
    reference_date = _previous_ramadan(shop_fr)
    _seed_youssef_profile(shop_fr, youssef, reference_date)
    _seed_youssef_calculation(shop_fr, youssef, reference_date)
    zakat_services.get_or_create_profile(shop_ma, amira)
    stdout.write(
        f'  ✓ Zakat : profil complet et fiche {reference_date} pour youssef, '
        'profil sans choix pour amira',
    )
