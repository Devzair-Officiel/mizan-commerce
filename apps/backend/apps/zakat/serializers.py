from decimal import Decimal
from typing import Any

from rest_framework import serializers

from apps.orders.models import Order
from . import hawl, services
from .models import ZakatCalculation, ZakatProfile


VALID_DEBT_CATEGORIES = {'supplier', 'tax_vat', 'salary', 'loan', 'rent', 'other'}
# `gold_silver` : lingots et pièces ; `jewelry` : bijoux portés (référentiel D7).
VALID_OTHER_ASSET_CATEGORIES = {
    'personal_cash', 'business', 'real_estate', 'gold_silver', 'jewelry', 'for_resale',
    'other',
}
MAX_LINES = services.MAX_LINES
NISAB_METHOD_CHOICES = [
    (ZakatProfile.NISAB_METHOD_SILVER, 'Argent (595 g)'),
    (ZakatProfile.NISAB_METHOD_GOLD, 'Or (85 g)'),
]
CHOICE_KEYS = (
    'calendar', 'nisab_method', 'nisab_unit_price', 'nisab_price_updated_at',
    'stock_valuation', 'receivables_mode', 'debts_mode', 'ownership_share',
)


def _amount_field() -> serializers.DecimalField:
    return serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0'))  # noqa: E501


def _label_field() -> serializers.CharField:
    return serializers.CharField(max_length=200, allow_blank=True, default='')


def _choice_field(choices: list[tuple[str, str]]) -> serializers.ChoiceField:
    """Choix d'avis : une valeur de la liste, jamais `null` une fois choisi."""
    return serializers.ChoiceField(choices=choices, required=False)


def _unit_price_field() -> serializers.DecimalField:
    return serializers.DecimalField(
        max_digits=10, decimal_places=2, min_value=Decimal('0.01'),
        allow_null=True, required=False,
    )


def _share_field() -> serializers.DecimalField:
    return serializers.DecimalField(
        max_digits=5, decimal_places=2, min_value=Decimal('0.01'), max_value=Decimal('100'),  # noqa: E501
        required=False,
    )


def _validate_hijri_range(value):
    """Date convertible en hégirien (1924-08-01 → 2077-11-16), quel que soit le calendrier."""  # noqa: E501
    try:
        hawl.to_hijri(value)
    except hawl.HijriRangeError:
        raise serializers.ValidationError('Date hors de la plage prise en charge (1924 à 2077).')  # noqa: E501
    return value


def _json_safe(items: list[dict], keys: tuple[str, ...]) -> list[dict]:
    """`Decimal` et `UUID` en str avant stockage JSON (JSONField ne les accepte pas)."""
    return [
        {**item, **{k: str(item[k]) for k in keys if item.get(k) is not None}}
        for item in items
    ]


# ── Lignes de saisie ──────────────────────────────────────────────────────────

class DebtLineSerializer(serializers.Serializer):
    """Ligne de dette : montant total et part due dans les 12 mois."""
    category = serializers.ChoiceField(choices=sorted(VALID_DEBT_CATEGORIES))
    label = _label_field()
    amount = _amount_field()
    amount_within_12_months = _amount_field()

    def validate(self, attrs: dict) -> dict:
        if attrs['amount_within_12_months'] > attrs['amount']:
            raise serializers.ValidationError(
                {'amount_within_12_months': 'La part due dans les 12 mois dépasse le montant.'},  # noqa: E501
            )
        return attrs


class ReceivableItemSerializer(serializers.Serializer):
    """Créance : une commande de la boutique (reste dû) ou une ligne libre."""
    order_id = serializers.UUIDField(allow_null=True, required=False, default=None)
    label = _label_field()
    amount = _amount_field()
    doubtful = serializers.BooleanField(default=False)


class OtherAssetSerializer(serializers.Serializer):
    """Autre bien (personnel) ; `counted` est choisi ligne par ligne, sans défaut."""
    category = serializers.ChoiceField(choices=sorted(VALID_OTHER_ASSET_CATEGORIES))
    label = _label_field()
    amount = _amount_field()
    counted = serializers.BooleanField()


# ── Bloc `totals` (lecture seule) ─────────────────────────────────────────────

def _money(**kwargs: Any) -> serializers.DecimalField:
    return serializers.DecimalField(max_digits=16, decimal_places=2, read_only=True, **kwargs)  # noqa: E501


class ZakatTotalsSerializer(serializers.Serializer):
    status = serializers.CharField(read_only=True)
    missing_choices = serializers.ListField(child=serializers.CharField(), read_only=True)  # noqa: E501
    ownership_share = _money()
    cash = _money()
    stock = _money(allow_null=True)
    stock_at_sale_price = _money()
    stock_at_purchase_price = _money()
    receivables_sure = _money()
    receivables_doubtful = _money()
    receivables_in_base = _money(allow_null=True)
    receivables_on_collection = _money(allow_null=True)
    other_assets = _money()
    debts_total = _money()
    debts_within_12_months = _money()
    debts_deducted = _money(allow_null=True)
    base = _money(allow_null=True)
    nisab_threshold = _money(allow_null=True)
    nisab_compared_amount = _money(allow_null=True)
    nisab_ratio = serializers.DecimalField(max_digits=4, decimal_places=3, read_only=True, allow_null=True)  # noqa: E501
    rate = serializers.DecimalField(max_digits=8, decimal_places=6, read_only=True, allow_null=True)  # noqa: E501
    zakat_now = _money(allow_null=True)
    zakat_on_collection = _money(allow_null=True)
    zakat_total = _money(allow_null=True)
    option_effects = serializers.DictField(
        child=serializers.DictField(child=_money(allow_null=True)), read_only=True,
    )


# ── Calcul ────────────────────────────────────────────────────────────────────

class ZakatChoicesSerializer(serializers.Serializer):
    """Choix de la fiche (copiés du profil à la création, modifiables ensuite).

    En écriture, seules les clés envoyées changent ; en lecture, toutes les clés.
    """
    calendar = _choice_field(hawl.CALENDAR_CHOICES)
    nisab_method = _choice_field(NISAB_METHOD_CHOICES)
    nisab_unit_price = _unit_price_field()
    stock_valuation = _choice_field(ZakatProfile.STOCK_VALUATION_CHOICES)
    receivables_mode = _choice_field(ZakatProfile.RECEIVABLES_MODE_CHOICES)
    debts_mode = _choice_field(ZakatProfile.DEBTS_MODE_CHOICES)
    ownership_share = _share_field()

    def to_representation(self, instance: dict[str, Any]) -> dict[str, Any]:
        return {name: (instance or {}).get(name) for name in CHOICE_KEYS}


class _OrderSummarySerializer(serializers.Serializer):
    order_id = serializers.UUIDField()
    order_number = serializers.CharField(allow_null=True)
    customer_name = serializers.CharField(allow_null=True)
    created_at = serializers.DateTimeField(allow_null=True)
    remaining = serializers.DecimalField(max_digits=12, decimal_places=2, allow_null=True)  # noqa: E501


class _LinkedOrderSerializer(_OrderSummarySerializer):
    state = serializers.CharField()


class _ReceivableOrdersSerializer(serializers.Serializer):
    linked = _LinkedOrderSerializer(many=True)
    new = _OrderSummarySerializer(many=True)


class ZakatReviewSerializer(serializers.Serializer):
    """Repères de l'écran de la fiche (lecture seule, calculés à chaque réponse)."""
    is_latest = serializers.BooleanField()
    is_live = serializers.BooleanField()
    hawl_date_differs = serializers.BooleanField()
    receivable_orders = _ReceivableOrdersSerializer()


def _reference_hijri(obj: ZakatCalculation) -> dict[str, int] | None:
    try:
        year, month, day = hawl.to_hijri(obj.reference_date)
    except hawl.HijriRangeError:
        return None
    return {'year': year, 'month': month, 'day': day}


class ZakatCalculationListSerializer(serializers.ModelSerializer):
    """Ligne de l'historique : repères de la fiche et bloc `totals`."""
    reference_hijri = serializers.SerializerMethodField()
    totals = serializers.SerializerMethodField()

    class Meta:
        model = ZakatCalculation
        fields = [
            'id', 'reference_date', 'reference_hijri', 'hawl_calendar', 'hawl_year',
            'current_step', 'currency', 'updated_at', 'totals',
        ]
        read_only_fields = fields

    def get_reference_hijri(self, obj: ZakatCalculation) -> dict[str, int] | None:
        return _reference_hijri(obj)

    def get_totals(self, obj: ZakatCalculation) -> dict[str, Any]:
        return ZakatTotalsSerializer(services.compute_totals(obj)).data


class ZakatCalculationSerializer(serializers.ModelSerializer):
    reference_hijri = serializers.SerializerMethodField()
    totals = serializers.SerializerMethodField()
    review = serializers.SerializerMethodField()
    choices = ZakatChoicesSerializer(source='choices_snapshot', required=False)
    # Facultative : sans date, le prochain jour J du profil (ou aujourd'hui).
    reference_date = serializers.DateField(required=False)
    # Dernière étape validée de l'assistant (0 = aucune, 6 = toutes les saisies).
    current_step = serializers.IntegerField(min_value=0, max_value=6, required=False)
    receivable_items = serializers.ListField(
        child=ReceivableItemSerializer(), required=False, max_length=MAX_LINES,
    )
    other_assets = serializers.ListField(
        child=OtherAssetSerializer(), required=False, max_length=MAX_LINES,
    )
    debt_items = serializers.ListField(
        child=DebtLineSerializer(), required=False, max_length=MAX_LINES,
    )
    stock_extra = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal('0'), required=False,
    )
    # Obligatoire sur PATCH (voir `validate`) : version périmée → 409.
    version = serializers.IntegerField(min_value=1, required=False)
    refresh_stock = serializers.BooleanField(write_only=True, required=False, default=False)  # noqa: E501

    class Meta:
        model = ZakatCalculation
        fields = [
            'id', 'current_step', 'reference_date', 'reference_hijri',
            'hawl_calendar', 'hawl_year', 'version',
            'cash_amount',
            'receivable_items', 'other_assets', 'debt_items',
            'stock_sale_value', 'stock_purchase_value', 'stock_extra', 'refresh_stock',
            'choices', 'totals', 'review',
            'currency', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'hawl_calendar', 'hawl_year',
            'stock_sale_value', 'stock_purchase_value',
            'currency', 'created_at', 'updated_at',
        ]
        extra_kwargs = {'cash_amount': {'min_value': Decimal('0')}}

    def get_reference_hijri(self, obj: ZakatCalculation) -> dict[str, int] | None:
        return _reference_hijri(obj)

    def get_totals(self, obj: ZakatCalculation) -> dict[str, Any]:
        return ZakatTotalsSerializer(services.compute_totals(obj)).data

    def get_review(self, obj: ZakatCalculation) -> dict[str, Any]:
        return ZakatReviewSerializer(services.calculation_review(obj)).data

    def validate_reference_date(self, value):
        return _validate_hijri_range(value)

    def validate_receivable_items(self, items: list[dict]) -> list[dict]:
        """Chaque commande citée appartient à la boutique, une seule fois."""
        order_ids = [item['order_id'] for item in items if item.get('order_id')]
        if len(order_ids) != len(set(order_ids)):
            raise serializers.ValidationError('Une commande ne peut figurer qu\'une fois.')  # noqa: E501
        shop = self.context['shop']
        known = set(Order.objects.filter(shop=shop, pk__in=order_ids).values_list('pk', flat=True))  # noqa: E501
        if known != set(order_ids):
            raise serializers.ValidationError('Commande introuvable.')
        return items

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if self.instance is not None and 'version' not in attrs:
            raise serializers.ValidationError(
                {'version': self.fields['version'].error_messages['required']},
                code='required',
            )
        return attrs

    def to_internal_value(self, data):
        validated = super().to_internal_value(data)
        json_keys = {
            'receivable_items': ('amount', 'order_id'),
            'other_assets': ('amount',),
            'debt_items': ('amount', 'amount_within_12_months'),
        }
        for key, keys in json_keys.items():
            if key in validated:
                validated[key] = _json_safe(validated[key], keys)
        return validated


# ── Profil ────────────────────────────────────────────────────────────────────

class ZakatProfileSerializer(serializers.ModelSerializer):
    """Point de départ des choix d'une nouvelle fiche, jour J et prochain hawl."""
    next_hawl = serializers.SerializerMethodField()
    nisab_threshold = serializers.SerializerMethodField()
    hawl_date = serializers.DateField(allow_null=True, required=False, validators=[_validate_hijri_range])  # noqa: E501
    calendar = _choice_field(hawl.CALENDAR_CHOICES)
    nisab_method = _choice_field(NISAB_METHOD_CHOICES)
    nisab_unit_price = _unit_price_field()
    stock_valuation = _choice_field(ZakatProfile.STOCK_VALUATION_CHOICES)
    receivables_mode = _choice_field(ZakatProfile.RECEIVABLES_MODE_CHOICES)
    debts_mode = _choice_field(ZakatProfile.DEBTS_MODE_CHOICES)
    ownership_share = _share_field()

    class Meta:
        model = ZakatProfile
        fields = [
            'hawl_date', 'calendar', 'next_hawl',
            'nisab_method', 'nisab_unit_price', 'nisab_price_updated_at', 'nisab_threshold',  # noqa: E501
            'stock_valuation', 'receivables_mode', 'debts_mode',
            'ownership_share', 'reminder_email_enabled', 'updated_at',
        ]
        read_only_fields = ['nisab_price_updated_at', 'updated_at']

    def get_next_hawl(self, obj: ZakatProfile) -> dict[str, Any] | None:
        info = services.next_hawl(obj)
        if info is None:
            return None
        calculation_id = info['calculation_id']
        return {
            **info,
            'date': info['date'].isoformat(),
            'calculation_id': str(calculation_id) if calculation_id else None,
        }

    def get_nisab_threshold(self, obj: ZakatProfile) -> str | None:
        threshold = services.nisab_threshold_for(obj.nisab_method, obj.nisab_unit_price)
        return str(threshold) if threshold is not None else None


# ── Sources ───────────────────────────────────────────────────────────────────

class _FormatWithoutPriceSerializer(serializers.Serializer):
    variant_id = serializers.UUIDField()
    product_id = serializers.UUIDField()
    product_name = serializers.CharField()
    packaging_name = serializers.CharField()


class _StockLineSerializer(serializers.Serializer):
    variant_id = serializers.UUIDField()
    product_id = serializers.UUIDField()
    product_name = serializers.CharField()
    packaging_name = serializers.CharField()
    quantity = serializers.DecimalField(max_digits=14, decimal_places=3)
    sale_price = serializers.DecimalField(max_digits=12, decimal_places=2)
    purchase_price = serializers.DecimalField(max_digits=12, decimal_places=2, allow_null=True)  # noqa: E501
    sale_value = serializers.DecimalField(max_digits=16, decimal_places=2)
    purchase_value = serializers.DecimalField(max_digits=16, decimal_places=2, allow_null=True)  # noqa: E501


class _TopStockLinesSerializer(serializers.Serializer):
    sale = _StockLineSerializer(many=True)
    purchase = _StockLineSerializer(many=True)


class ZakatSourcesSerializer(serializers.Serializer):
    currency = serializers.CharField()
    stock_sale_value = serializers.DecimalField(max_digits=14, decimal_places=2)
    stock_purchase_value = serializers.DecimalField(max_digits=14, decimal_places=2)
    active_formats_count = serializers.IntegerField()
    formats_without_purchase_price = _FormatWithoutPriceSerializer(many=True)
    top_stock_lines = _TopStockLinesSerializer()
    unpaid_orders = _OrderSummarySerializer(many=True)
    unpaid_total = serializers.DecimalField(max_digits=14, decimal_places=2)
