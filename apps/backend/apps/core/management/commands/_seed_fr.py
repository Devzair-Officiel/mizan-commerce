"""Jeu de données réaliste — La Boutique de Youssef (FR/EUR).

Importé par seed_data.py via ``from .seed_fr import run_seed_fr``.
Ne pas exécuter directement.
"""

import datetime
import random
import zoneinfo
from collections import Counter
from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone

from apps.customers.factories import CustomerFactory
from apps.customers.models import Customer
from apps.notes.models import Reminder
from apps.orders import services as order_services
from apps.orders.models import Order, OrderItem
from apps.products.models import Product, ProductVariant
from apps.stock.factories import StockMovementFactory
from apps.stock.models import StockMovement

_RNG = random.Random(42)
_TZ_FR = zoneinfo.ZoneInfo("Europe/Paris")


# ── Helpers bas niveau ─────────────────────────────────────────────────────────


def _make_dt(date: datetime.date, hour: int, minute: int) -> datetime.datetime:
    return datetime.datetime(
        date.year, date.month, date.day, hour, minute, tzinfo=_TZ_FR
    )


def _antidate(order: Order, target_dt: datetime.datetime) -> None:
    """Antidate la commande et ses enregistrements liés (items + mouvements)."""
    Order.objects.filter(pk=order.pk).update(created_at=target_dt)
    OrderItem.objects.filter(order=order).update(created_at=target_dt)
    StockMovement.objects.filter(order_id=order.pk).update(created_at=target_dt)


def _seed_variant(
    shop,
    product,
    packaging_name,
    sku,
    selling_price,
    purchase_price=None,
    threshold=None,
    position=0,
) -> ProductVariant:
    variant, _ = ProductVariant.objects.get_or_create(
        product=product,
        packaging_name=packaging_name,
        defaults={
            "shop": shop,
            "unit": "piece",
            "base_quantity": 1,
            "selling_price": Decimal(str(selling_price)),
            "purchase_price": Decimal(str(purchase_price)) if purchase_price else None,
            "low_stock_threshold": (
                Decimal(str(threshold)) if threshold is not None else None
            ),
            "sku": sku,
            "position": position,
            "is_active": True,
        },
    )
    return variant


def _initial_stock(shop, variant, qty, user) -> None:
    """Crée le mouvement d'entrée initial (idempotent) et l'antidate à J-35."""
    if variant.stock_movements.exists() or qty == 0:
        return
    mv = StockMovementFactory(
        shop=shop,
        variant=variant,
        movement_type="in",
        quantity=qty,
        reason="Stock initial — seeding",
        created_by=user,
    )
    ref = _make_dt(datetime.date.today() - datetime.timedelta(days=35), 8, 0)
    StockMovement.objects.filter(pk=mv.pk).update(created_at=ref)


def _make_order(
    shop, user, target_dt, customer, items, final_status, pay=None
) -> Order:
    """Crée, transite, paie et antidate une commande en une seule opération."""
    order = order_services.create_order(shop, user, customer=customer)
    for variant, qty in items:
        order_services.add_item(order, variant, qty)

    if final_status == "cancelled":
        order_services.transition_status(order, "cancelled", user)
    elif final_status != "draft":
        order_services.transition_status(order, "to_prepare", user)
        if final_status in ("prepared", "shipped"):
            order_services.transition_status(order, "prepared", user)
        if final_status == "shipped":
            order_services.transition_status(order, "shipped", user)

    if pay == "full":
        order.refresh_from_db()
        order_services.update_payment(order, order.total_amount)
    elif isinstance(pay, Decimal):
        order_services.update_payment(order, pay)

    _antidate(order, target_dt)
    return order


# ── Catalogue ──────────────────────────────────────────────────────────────────


def _seed_existing_products(shop, user) -> list[ProductVariant]:
    """Recrée les 5 produits d'origine avec un stock suffisant pour 45 commandes."""

    def prod(name):
        p, _ = Product.objects.get_or_create(shop=shop, name=name)
        return p

    def vs(product, sku, price, cost, threshold, qty) -> ProductVariant:
        v = _seed_variant(shop, product, "Par défaut", sku, price, cost, threshold)
        _initial_stock(shop, v, qty, user)
        return v

    chemise = vs(prod("Chemise en lin blanc"), "CHE-LIN-001", "29.99", "12.50", 3, 30)
    pantalon = vs(prod("Pantalon chino beige"), "PAN-CHI-002", "44.99", "18.00", 2, 20)
    sandales = vs(prod("Sandales cuir naturel"), "SAN-CUI-003", "59.90", "22.00", 2, 6)
    ceinture = vs(
        prod("Ceinture tressée marron"), "CEI-TRE-004", "19.99", "8.00", 5, 25
    )
    # Sac volontairement sous seuil : stock 2 < threshold 3 → démo état bas
    vs(prod("Sac en toile naturelle"), "SAC-TOI-005", "35.00", "14.00", 3, 2)

    return [chemise, pantalon, sandales, ceinture]  # sac exclu du pool commandes


def _seed_new_products(
    shop,
    user,
) -> tuple[list[ProductVariant], list[ProductVariant]]:
    """Crée les 7 nouveaux articles (3 multi-variantes + 2 services)."""
    safe: list[ProductVariant] = []
    services: list[ProductVariant] = []

    def prod(name, ptype="product"):
        p, _ = Product.objects.get_or_create(
            shop=shop, name=name, defaults={"type": ptype}
        )
        return p

    def sv(product, packaging, sku, price, cost=None, threshold=None, pos=0, qty=0):
        v = _seed_variant(shop, product, packaging, sku, price, cost, threshold, pos)
        _initial_stock(shop, v, qty, user)
        return v

    # 6. Veste en lin kaki — S/M/L
    veste = prod("Veste en lin kaki")
    sv(veste, "S", "VES-LIN-006-S", "79.90", "30.00", threshold=2, pos=0, qty=6)
    safe.append(
        sv(veste, "M", "VES-LIN-006-M", "79.90", "30.00", threshold=2, pos=1, qty=15)
    )
    sv(veste, "L", "VES-LIN-006-L", "79.90", "30.00", threshold=2, pos=2, qty=10)

    # 7. Espadrilles toile beige — 40-43 (41 sous seuil, 43 rupture)
    esp = prod("Espadrilles toile beige")
    sv(esp, "40", "ESP-TOI-007-40", "49.90", "19.00", threshold=2, pos=0, qty=4)
    sv(esp, "41", "ESP-TOI-007-41", "49.90", "19.00", threshold=2, pos=1, qty=1)
    sv(esp, "42", "ESP-TOI-007-42", "49.90", "19.00", threshold=2, pos=2, qty=3)
    sv(esp, "43", "ESP-TOI-007-43", "49.90", "19.00", threshold=2, pos=3, qty=0)

    # 8. Écharpe en lin naturel
    echarpe = prod("Écharpe en lin naturel")
    safe.append(
        sv(echarpe, "Par défaut", "ECH-LIN-008", "24.90", "9.00", threshold=3, qty=20)
    )

    # 9. Pochette en cuir naturel
    pochette = prod("Pochette en cuir naturel")
    safe.append(
        sv(pochette, "Par défaut", "POC-CUI-009", "45.00", "18.00", threshold=2, qty=12)
    )

    # 10. Short en toile beige — S/M et L/XL
    short = prod("Short en toile beige")
    safe.append(
        sv(short, "S/M", "SHO-TOI-010-SM", "32.00", "13.00", threshold=2, pos=0, qty=10)
    )
    sv(short, "L/XL", "SHO-TOI-010-LXL", "32.00", "13.00", threshold=2, pos=1, qty=8)

    # 11. Casquette en toile
    casquette = prod("Casquette en toile")
    safe.append(
        sv(casquette, "Par défaut", "CAS-TOI-011", "18.00", "7.00", threshold=4, qty=15)
    )

    # 12. Retouche ourlet (service)
    retouche = prod("Retouche ourlet", "service")
    services.append(sv(retouche, "Par défaut", "SVC-RET-012", "12.00", qty=0))

    # 13. Emballage cadeau (service)
    emballage = prod("Emballage cadeau", "service")
    services.append(sv(emballage, "Par défaut", "SVC-EMB-013", "5.00", qty=0))

    return safe, services


def seed_products_fr(
    shop,
    user,
) -> tuple[list[ProductVariant], list[ProductVariant]]:
    """Crée les 12 articles FR. Retourne (safe_variants, service_variants).

    safe_variants indices :
      0 chemise, 1 pantalon, 2 sandales, 3 ceinture,
      4 veste_M, 5 écharpe, 6 pochette, 7 short_SM, 8 casquette
    """
    safe = _seed_existing_products(shop, user)
    new_safe, services = _seed_new_products(shop, user)
    safe.extend(new_safe)
    return safe, services


# ── Clients ────────────────────────────────────────────────────────────────────


_CUSTOMERS_FR = [
    ("Karima Bensouda", "+33612345678", "Lyon", "Cliente fidèle depuis 2 ans."),
    ("Hamza Tazi", "+33698765432", "Paris", ""),
    (
        "Nadia El Fassi",
        "+33655443322",
        "Marseille",
        "Préfère la livraison en point relais.",
    ),
    (
        "Fatima Zahra Idrissi",
        "+33623456789",
        "Toulouse",
        "Commande souvent en début de saison.",
    ),
    ("Mehdi Ouali", "+33634567890", "Paris", ""),
    ("Leila Benomar", "+33645678901", "Bordeaux", "Préfère les livraisons en semaine."),
    ("Yassine Chafai", "+33656789012", "Nice", ""),
    ("Samira Harrach", "+33667890123", "Strasbourg", "Régulière depuis le printemps."),
    ("Omar Berrada", "+33678901234", "Montpellier", ""),
    ("Dounia Tazi", "+33689012345", "Nantes", "Grande taille — préfère L et XL."),
    ("Amine Benchekroun", "+33690123456", "Grenoble", ""),
    ("Rania Saadi", "+33601234567", "Lille", "Achète souvent pour offrir."),
]


def seed_customers_fr(shop) -> list[Customer]:
    return [
        CustomerFactory(
            shop=shop, name=name, phone=phone, city=city, country="FR", notes=notes
        )
        for name, phone, city, notes in _CUSTOMERS_FR
    ]


# ── Commandes ─────────────────────────────────────────────────────────────────


def _seed_today_orders(shop, user, sv, svc_v, by_name, now, today) -> list[Order]:
    """5 commandes aujourd'hui, réparties dans la fenêtre [09:00 → now-10min]."""
    nine_am = _make_dt(today, 9, 0)
    window_end = now - datetime.timedelta(minutes=10)
    if window_end <= nine_am:
        window_start = now - datetime.timedelta(minutes=40)
    else:
        window_start = nine_am
    total_min = max(50, int((window_end - window_start).total_seconds() / 60))
    step = total_min // 5

    # (cust_name | None, items, final_status, pay)
    specs = [
        ("Karima Bensouda", [(sv[0], 2)], "to_prepare", None),
        (None, [(sv[1], 1)], "to_prepare", None),
        ("Hamza Tazi", [(sv[3], 2), (sv[5], 1)], "shipped", "full"),
        ("Fatima Zahra Idrissi", [(sv[4], 1)], "draft", None),
        ("Mehdi Ouali", [(sv[6], 1), (sv[8], 1)], "shipped", "full"),
    ]
    orders = []
    for i, (cname, items, status, pay) in enumerate(specs):
        dt = window_start + datetime.timedelta(minutes=i * step)
        customer = by_name.get(cname) if cname else None
        orders.append(_make_order(shop, user, dt, customer, items, status, pay))
    return orders


def _seed_special_past_orders(shop, user, sv, svc_v, by_name, today) -> list[Order]:
    """9 commandes passées couvrant tous les cas du dashboard (impayées, statuts, etc.)."""  # noqa: E501

    def dt(days_ago, h, m):
        return _make_dt(today - datetime.timedelta(days=days_ago), h, m)

    def o(days, h, m, cname, items, status, pay=None):
        c = by_name.get(cname) if cname else None
        return _make_order(shop, user, dt(days, h, m), c, items, status, pay)

    return [
        # J-1 : 1 to_prepare (impayée partielle) + 2 prepared
        o(1, 10, 0, "Leila Benomar", [(sv[0], 1)], "to_prepare", Decimal("15.00")),
        o(1, 14, 30, "Yassine Chafai", [(sv[7], 1)], "prepared"),
        o(1, 16, 0, "Samira Harrach", [(sv[8], 2)], "prepared", "full"),
        # J-2
        o(2, 9, 30, "Dounia Tazi", [(sv[5], 1)], "draft"),
        o(2, 15, 0, "Omar Berrada", [(sv[1], 1), (sv[2], 1)], "shipped", "full"),
        # J-3
        o(
            3,
            10,
            15,
            "Nadia El Fassi",
            [(sv[3], 2), (sv[5], 1)],
            "shipped",
            Decimal("80.00"),
        ),
        o(3, 14, 0, "Amine Benchekroun", [(sv[0], 1)], "cancelled"),
        # J-6 : impayée ancienne (ancienneté variée)
        o(6, 11, 0, "Rania Saadi", [(sv[4], 1), (svc_v[0], 1)], "shipped"),
        # J-10 : annulée ancienne
        o(10, 9, 45, "Karima Bensouda", [(sv[5], 1)], "cancelled"),
    ]


def _seed_bulk_historical(shop, user, sv, by_name, today) -> list[Order]:
    """~30 commandes historiques (J-4 à J-29), expédiées et payées."""
    pool = list(by_name.values())
    orders = []
    for days_ago in range(29, 3, -1):
        day = today - datetime.timedelta(days=days_ago)
        wd = day.weekday()
        if wd == 6:  # dimanche fermé
            continue
        n = _RNG.choice([3, 4, 5]) if wd == 5 else _RNG.choice([0, 1, 1, 1, 2])
        for _ in range(n):
            h = _RNG.randint(9, 17)
            m = _RNG.choice([0, 15, 30, 45])
            customer = None if _RNG.random() < 0.20 else _RNG.choice(pool)
            picked = _RNG.sample(sv, _RNG.choice([1, 1, 2]))
            items = [(v, _RNG.randint(1, 2)) for v in picked]
            orders.append(
                _make_order(
                    shop, user, _make_dt(day, h, m), customer, items, "shipped", "full"
                )
            )
    return orders


def seed_orders_fr(shop, user, safe_v, svc_v, customers, stdout) -> list[Order]:
    now = timezone.now().astimezone(_TZ_FR)
    today = now.date()
    by_name = {c.name: c for c in customers}

    today_ord = _seed_today_orders(shop, user, safe_v, svc_v, by_name, now, today)
    special_ord = _seed_special_past_orders(shop, user, safe_v, svc_v, by_name, today)
    bulk_ord = _seed_bulk_historical(shop, user, safe_v, by_name, today)

    all_orders = today_ord + special_ord + bulk_ord

    statuses = Counter(
        Order.objects.filter(pk__in=[o.pk for o in all_orders]).values_list(
            "status", flat=True
        )
    )
    pay_cnt = (
        Order.objects.filter(
            pk__in=[o.pk for o in all_orders],
            payment_status__in=("unpaid", "partial"),
        )
        .exclude(status__in=("draft", "cancelled"))
        .count()
    )
    today_ca = Order.objects.filter(shop=shop, created_at__date=today).exclude(
        status__in=("draft", "cancelled")
    ).aggregate(t=Sum("total_amount"))["t"] or Decimal("0")
    stdout.write(
        f"    → {len(all_orders)} commandes : {dict(statuses)}"
        f" | {pay_cnt} impayées/partielles | CA aujourd'hui : {today_ca:.2f} EUR"
    )
    return all_orders


# ── Rappels ────────────────────────────────────────────────────────────────────


def seed_reminders_fr(shop, user, customers) -> None:
    if Reminder.objects.filter(shop=shop).exists():
        return
    by_name = {c.name: c for c in customers}
    now_local = timezone.now().astimezone(_TZ_FR)
    today = now_local.date()
    reminders = [
        dict(
            title="Rappel paiement — Karima Bensouda",
            category="unpaid",
            due_at=_make_dt(today, 10, 0),
            customer=by_name.get("Karima Bensouda"),
        ),
        dict(
            title="Préparer les commandes du samedi",
            category="order_prep",
            due_at=_make_dt(today, 15, 30),
        ),
        dict(
            title="Relance — Nadia El Fassi impayée",
            category="customer_followup",
            due_at=_make_dt(today - datetime.timedelta(days=1), 11, 0),
            customer=by_name.get("Nadia El Fassi"),
        ),
        dict(
            title="Inventaire mensuel",
            category="free",
            due_at=_make_dt(today + datetime.timedelta(days=1), 9, 0),
        ),
    ]
    for r in reminders:
        Reminder.objects.create(shop=shop, author=user, status="pending", **r)


# ── Point d'entrée ────────────────────────────────────────────────────────────


def run_seed_fr(shop, youssef, sara, stdout) -> None:
    """Orchestre le seeding complet de la boutique FR."""
    safe_v, svc_v = seed_products_fr(shop, youssef)
    customers = seed_customers_fr(shop)
    v_count = ProductVariant.objects.filter(shop=shop).count()
    stdout.write(f"    → {v_count} variantes, {len(customers)} clients")

    if not Order.objects.filter(shop=shop).exists():
        seed_orders_fr(shop, youssef, safe_v, svc_v, customers, stdout)
    else:
        stdout.write("    · Commandes existantes — skip")

    seed_reminders_fr(shop, youssef, customers)
