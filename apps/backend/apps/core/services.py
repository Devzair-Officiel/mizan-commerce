from calendar import monthrange
from datetime import datetime, date, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.db.models import Count, DateField, F, Min, Q, Sum
from django.db.models.functions import Trunc
from django.utils import timezone

from apps.customers.models import Customer, format_display_name
from apps.customers.services import name_search
from apps.notes.services import reminders_to_do, visible_to
from apps.orders.models import Order
from apps.orders.services import build_items_preview_batch
from apps.products.models import Product, ProductVariant
from apps.shops.models import Shop, ShopMember


def _qs_orders_to_prepare(shop: Shop):
    return Order.objects.filter(shop=shop, status="to_prepare")


def _qs_low_stock(shop: Shop):
    return ProductVariant.objects.filter(
        shop=shop,
        is_active=True,
        product__is_active=True,
        product__type="product",
    ).filter(
        Q(stock_quantity__lte=0)
        | Q(
            low_stock_threshold__isnull=False,
            stock_quantity__lte=F("low_stock_threshold"),
        )  # noqa: E501
    )


def _day_bounds(now: datetime, tz: ZoneInfo) -> tuple[datetime, datetime, date]:
    local = now.astimezone(tz)
    today_local = local.date()
    day_start = datetime(
        today_local.year, today_local.month, today_local.day, tzinfo=tz
    )  # noqa: E501
    day_end = day_start + timedelta(days=1)
    return day_start, day_end, today_local


def _build_today_revenue(shop: Shop, day_start: datetime, day_end: datetime) -> dict:
    qs = Order.objects.filter(
        shop=shop,
        created_at__gte=day_start,
        created_at__lt=day_end,
    ).exclude(status="cancelled")
    revenue = qs.aggregate(total=Sum("total_amount"))["total"] or Decimal("0")
    return {"revenue": str(revenue), "orders_count": qs.count()}


SALES_PERIODS = ("7d", "12m", "all")


def _local_start(day: date, tz: ZoneInfo) -> datetime:
    return datetime(day.year, day.month, day.day, tzinfo=tz)


def _add_months(day: date, months: int) -> date:
    index = day.year * 12 + day.month - 1 + months
    year, month = divmod(index, 12)
    return date(year, month + 1, min(day.day, monthrange(year, month + 1)[1]))


def _sales_orders(shop: Shop, start: date, end: date):
    """Commandes du chiffre d'affaires sur [start, end[ (jours du fuseau de la
    boutique) : non annulées, à leur date de création, comme le jour de l'accueil."""
    tz = ZoneInfo(shop.timezone)
    return Order.objects.filter(
        shop=shop,
        created_at__gte=_local_start(start, tz),
        created_at__lt=_local_start(end, tz),
    ).exclude(status="cancelled")


def _sales_buckets(
    shop: Shop, start: date, end: date, kind: str,
) -> list[dict]:
    """Un point par jour, semaine (lundi) ou mois sur [start, end[, vides compris."""
    tz = ZoneInfo(shop.timezone)
    rows = (
        _sales_orders(shop, start, end)
        .annotate(bucket=Trunc("created_at", kind, output_field=DateField(), tzinfo=tz))
        .values("bucket")
        .annotate(total=Sum("total_amount"), count=Count("id"))
        .order_by()
    )
    by_bucket = {row["bucket"]: (row["total"], row["count"]) for row in rows}
    points, current = [], start
    while current < end:
        total, count = by_bucket.get(current, (Decimal("0"), 0))
        points.append({"date": current, "revenue": total, "orders_count": count})
        if kind == "month":
            current = _add_months(current, 1)
        else:
            current += timedelta(days=7 if kind == "week" else 1)
    return points


def _opening_date(shop: Shop, tz: ZoneInfo) -> date:
    """Création de la boutique, ou première commande si elle est antérieure
    (historique repris)."""
    first = Order.objects.filter(shop=shop).exclude(status="cancelled").aggregate(
        first=Min("created_at"),
    )["first"]
    opened = min(shop.created_at, first) if first else shop.created_at
    return opened.astimezone(tz).date()


def _sales_window(shop: Shop, period: str, today: date) -> tuple[date, date, str, date]:
    """(début, fin exclue, granularité, première date affichée) de la période."""
    this_month = today.replace(day=1)
    if period == "7d":
        start = today - timedelta(days=6)
        return start, today + timedelta(days=1), "day", start
    if period == "12m":
        start = _add_months(this_month, -11)
        return start, _add_months(this_month, 1), "month", start
    opened = min(_opening_date(shop, ZoneInfo(shop.timezone)), today)
    if opened > _add_months(today, -2):
        # Moins de deux mois d'historique : un point par semaine.
        monday = today - timedelta(days=today.weekday())
        first_monday = opened - timedelta(days=opened.weekday())
        return first_monday, monday + timedelta(days=7), "week", opened
    return opened.replace(day=1), _add_months(this_month, 1), "month", opened


def _sales_comparison(
    shop: Shop, period: str, start: date, total: Decimal,
) -> dict | None:
    if period == "all":
        return None
    previous_start = (
        start - timedelta(days=7) if period == "7d" else _add_months(start, -12)
    )
    previous = _sales_orders(shop, previous_start, start).aggregate(
        total=Sum("total_amount"),
    )["total"] or Decimal("0")
    change = round((total - previous) / previous * 100) if previous > 0 else None
    return {"previous_total": str(previous), "change_pct": change}


def _month_summary(months: list[dict]) -> dict:
    """Meilleur mois (s'il a des ventes) et moyenne mensuelle."""
    best = max(months, key=lambda p: p["revenue"])
    total = sum((p["revenue"] for p in months), Decimal("0"))
    return {
        "best_month": (
            {"month": best["date"].isoformat(), "revenue": str(best["revenue"])}
            if best["revenue"] > 0 else None
        ),
        "monthly_average": str((total / len(months)).quantize(Decimal("0.01"))),
    }


def build_sales(shop: Shop, period: str, now: datetime | None = None) -> dict:
    """Ventes de l'accueil sur 7 jours, 12 mois ou depuis l'ouverture, dans le fuseau
    de la boutique : points, total, comparaison avec la période précédente (sauf
    « all »), meilleur mois et moyenne mensuelle (sauf « 7d »)."""
    tz = ZoneInfo(shop.timezone)
    today = (now or timezone.now()).astimezone(tz).date()
    start, end, kind, since = _sales_window(shop, period, today)
    points = _sales_buckets(shop, start, end, kind)
    total = sum((p["revenue"] for p in points), Decimal("0"))
    months = points if kind == "month" else []
    if kind == "week":
        months = _sales_buckets(
            shop, since.replace(day=1), _add_months(today.replace(day=1), 1), "month",
        )
    summary = (
        _month_summary(months) if months
        else {"best_month": None, "monthly_average": None}
    )
    return {
        "period": period,
        "granularity": kind,
        "start": since.isoformat(),
        "points": [
            {
                "date": p["date"].isoformat(),
                "revenue": str(p["revenue"]),
                "orders_count": p["orders_count"],
            }
            for p in points
        ],
        "total": str(total),
        "orders_count": sum(p["orders_count"] for p in points),
        "comparison": _sales_comparison(shop, period, start, total),
        **summary,
    }


def _customer_name(row: dict) -> str | None:
    """Nom complet du client d'une ligne `values()` (et retire ses champs), None sans client."""  # noqa: E501
    first_name = row.pop("customer__first_name", None)
    name = row.pop("customer__name", None)
    return format_display_name(first_name, name) if name is not None else None


def _build_orders_to_prepare(shop: Shop) -> dict:
    qs = _qs_orders_to_prepare(shop).select_related("customer").order_by("created_at")
    total = qs.count()
    rows = list(
        qs.values(
            "id",
            "order_number",
            "total_amount",
            "payment_status",
            "created_at",
            "customer__first_name",
            "customer__name",
        )[:5]  # noqa: E501
    )
    for o in rows:
        o["customer_name"] = _customer_name(o)

    oldest_created_at = rows[0]["created_at"].isoformat() if rows else None

    items_by_order = build_items_preview_batch([o["id"] for o in rows])
    for o in rows:
        oid = str(o["id"])
        all_items = items_by_order.get(oid, [])
        o["items_count"] = len(all_items)
        o["items_preview"] = all_items[:3]
        o["total_amount"] = str(o["total_amount"])
        o["created_at"] = o["created_at"].isoformat()

    return {"count": total, "oldest_created_at": oldest_created_at, "items": rows}


def _build_unpaid_orders(shop: Shop) -> dict:
    qs = Order.objects.filter(
        shop=shop,
        payment_status__in=("unpaid", "partial"),
        status__in=("to_prepare", "prepared", "shipped"),
    ).order_by("created_at")
    total = qs.count()
    agg = qs.aggregate(
        total_amount_sum=Sum("total_amount"), paid_sum=Sum("amount_paid")
    )  # noqa: E501
    total_due = (agg["total_amount_sum"] or Decimal("0")) - (
        agg["paid_sum"] or Decimal("0")
    )  # noqa: E501

    rows = list(
        qs.values(
            "id",
            "order_number",
            "total_amount",
            "payment_status",
            "created_at",
            "customer__first_name",
            "customer__name",
            "customer__phone",
            "customer_id",
            "amount_paid",
        )[:5]
    )
    for o in rows:
        o["customer_name"] = _customer_name(o)
        o["customer_phone"] = o.pop("customer__phone", None) or ""
        cid = o.pop("customer_id", None)
        o["customer_id"] = str(cid) if cid else None
        amount_due = (o["total_amount"] or Decimal("0")) - (
            o["amount_paid"] or Decimal("0")
        )  # noqa: E501
        o["amount_due"] = str(amount_due)
        o["total_amount"] = str(o["total_amount"])
        o["amount_paid"] = str(o["amount_paid"])
        o["created_at"] = o["created_at"].isoformat()

    return {"count": total, "total_due": str(total_due), "items": rows}


def _build_low_stock(shop: Shop) -> dict:
    qs = _qs_low_stock(shop).select_related("product").order_by("stock_quantity")
    total = qs.count()
    # Négatif (vendu au-delà du stock, à régulariser) et rupture (zéro) sont exclusifs.
    negative_count = qs.filter(stock_quantity__lt=0).count()
    out_of_stock_count = qs.filter(stock_quantity=0).count()
    rows = list(
        qs.values(
            "id",
            "packaging_name",
            "unit",
            "base_quantity",
            "stock_quantity",
            "low_stock_threshold",
            "product_id",
            "product__name",
        )[:5]
    )
    items = [
        {
            "id": row["product_id"],
            "variant_id": row["id"],
            "name": row["product__name"],
            "variant_name": row["packaging_name"],
            "unit": row["unit"],
            "base_quantity": row["base_quantity"],
            "stock_quantity": row["stock_quantity"],
            "low_stock_threshold": row["low_stock_threshold"],
        }
        for row in rows
    ]
    return {
        "count": total,
        "negative_count": negative_count,
        "out_of_stock_count": out_of_stock_count,
        "items": items,
    }


def _member_reminders_to_do(
    shop: Shop, member: ShopMember | None, now: datetime | None = None,
):
    """Rappels « à faire » d'un membre : les siens et ceux de toute l'équipe."""
    qs = reminders_to_do(shop, now)
    return qs.filter(visible_to(member)) if member else qs


def _build_today_reminders(
    shop: Shop, now: datetime, day_start: datetime, member: ShopMember | None,
) -> dict:
    # Rappels « à faire » : en retard + aujourd'hui (même définition que le badge)
    if member and not member.has_module("reminders"):
        return {"count": 0, "items": []}
    qs = _member_reminders_to_do(shop, member, now).values(
        "id",
        "title",
        "category",
        "due_at",
        "customer_id",
        "order_id",
    )

    all_items = list(qs)
    total = len(all_items)

    all_items.sort(key=lambda r: (r["due_at"] >= day_start, r["due_at"]))

    items = [
        {
            "id": str(r["id"]),
            "title": r["title"],
            "category": r["category"],
            "due_at": r["due_at"].isoformat(),
            "customer_id": str(r["customer_id"]) if r["customer_id"] else None,
            "order_id": str(r["order_id"]) if r["order_id"] else None,
            "is_overdue": r["due_at"] < day_start,
        }
        for r in all_items[:5]
    ]
    return {"count": total, "items": items}


def _build_setup(shop: Shop) -> dict:
    return {
        "has_orders": Order.objects.filter(shop=shop).exists(),
        "products_count": Product.objects.filter(shop=shop, is_active=True).count(),
        "customers_count": Customer.objects.filter(shop=shop, is_active=True).count(),
    }


def build_nav_badges(shop: Shop, member: ShopMember) -> dict[str, int]:
    result: dict[str, int] = {}
    if member.has_module("orders"):
        count = _qs_orders_to_prepare(shop).count()
        if count > 0:
            result["orders_to_prepare"] = count
    if member.has_module("stock"):
        count = _qs_low_stock(shop).count()
        if count > 0:
            result["low_stock"] = count
    if member.has_module("reminders"):
        count = _member_reminders_to_do(shop, member).count()
        if count > 0:
            result["reminders_due"] = count
    return result


def build_dashboard_today(
    shop: Shop, now: datetime | None = None, member: ShopMember | None = None,
) -> dict:
    """Accueil du jour. Avec `member`, les rappels sont ceux de ce membre."""
    if now is None:
        now = timezone.now()
    tz = ZoneInfo(shop.timezone)
    day_start, day_end, _ = _day_bounds(now, tz)

    today_data = _build_today_revenue(shop, day_start, day_end)

    return {
        "today": {
            "revenue": today_data["revenue"],
            "orders_count": today_data["orders_count"],
        },
        "orders_to_prepare": _build_orders_to_prepare(shop),
        "unpaid_orders": _build_unpaid_orders(shop),
        "low_stock_products": _build_low_stock(shop),
        "today_reminders": _build_today_reminders(shop, now, day_start, member),
        "setup": _build_setup(shop),
    }


_SEARCH_LIMIT = 5


def _search_products(shop: Shop, q: str) -> dict:
    qs = (
        Product.objects.filter(shop=shop, is_active=True)
        .filter(
            Q(name__icontains=q)
            | Q(variants__sku__icontains=q)
            | Q(variants__barcode__icontains=q)
        )
        .distinct()
        .prefetch_related("variants")
    )
    total = qs.count()
    items = []
    for p in qs[:_SEARCH_LIMIT]:
        variants = [v for v in p.variants.all() if v.is_active]
        min_price = min((v.selling_price for v in variants), default=None)
        ref = next((v.sku or v.barcode for v in variants if v.sku or v.barcode), "")
        items.append(
            {
                "id": str(p.id),
                "name": p.name,
                "reference": ref,
                "type": p.type,
                "variant_count": len(variants),
                "is_out_of_stock": all(v.is_out_of_stock for v in variants) if variants else True,  # noqa: E501
                "min_price": str(min_price) if min_price is not None else None,
            }
        )
    return {"total": total, "items": items}


def _search_customers(shop: Shop, q: str) -> dict:
    qs = Customer.objects.filter(shop=shop, is_active=True).filter(
        name_search(q) | Q(phone__icontains=q)
    )
    total = qs.count()
    rows = list(
        qs.values("id", "first_name", "name", "phone", "city")[:_SEARCH_LIMIT]
    )
    for c in rows:
        c["id"] = str(c["id"])
        c["display_name"] = format_display_name(c["first_name"], c["name"])
    return {"total": total, "items": rows}


def _search_orders(shop: Shop, q: str) -> dict:
    qs = Order.objects.filter(shop=shop).filter(
        Q(order_number__icontains=q) | name_search(q, "customer__")
    )
    total = qs.count()
    rows = list(
        qs.values(
            "id", "order_number", "status", "payment_status",
            "total_amount", "created_at", "customer__first_name", "customer__name",
        )[:_SEARCH_LIMIT]
    )
    items = []
    for o in rows:
        items.append(
            {
                "id": str(o["id"]),
                "order_number": o["order_number"],
                "status": o["status"],
                "payment_status": o["payment_status"],
                "total_amount": str(o["total_amount"]),
                "created_at": o["created_at"].isoformat(),
                "customer_name": _customer_name(o),
            }
        )
    return {"total": total, "items": items}


def global_search(shop: Shop, member: ShopMember, q: str) -> dict:
    """Recherche globale filtrée par les modules du membre.

    Chaque section expose `total` (nb total de correspondances) + `items` (≤ 5).
    Seules les sections dont le membre a le module sont peuplées.
    """
    _empty: dict = {"total": 0, "items": []}
    products = _search_products(shop, q) if member.has_module("products") else _empty
    customers = _search_customers(shop, q) if member.has_module("customers") else _empty
    orders = _search_orders(shop, q) if member.has_module("orders") else _empty
    return {"products": products, "customers": customers, "orders": orders}
