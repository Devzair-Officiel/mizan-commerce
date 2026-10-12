from rest_framework import serializers

from .models import Customer
from .services import InvalidPhoneNumber, format_phone_display, normalize_phone

PHONE_INVALID = 'Numéro de téléphone invalide'


def validated_phone(value: str, region: str = '') -> str:
    """Numéro normalisé en E.164 (`normalize_phone`), erreur de validation sinon.

    `region` : pays du numéro saisi sans indicatif (celui de la boutique).
    """
    try:
        return normalize_phone(value, region)
    except InvalidPhoneNumber:
        raise serializers.ValidationError(PHONE_INVALID) from None


class CustomerSerializer(serializers.ModelSerializer):
    order_count = serializers.IntegerField(read_only=True, default=0)
    last_order_at = serializers.DateTimeField(read_only=True, default=None)
    pending_amount = serializers.SerializerMethodField()
    paid_amount = serializers.SerializerMethodField()
    phone_display = serializers.SerializerMethodField()
    display_name = serializers.CharField(read_only=True)

    def get_phone_display(self, obj: Customer) -> str:
        return format_phone_display(obj.phone)

    def get_pending_amount(self, obj) -> str:
        val = getattr(obj, 'pending_amount', None)
        from decimal import Decimal
        return str(val if val is not None else Decimal('0.00'))

    def get_paid_amount(self, obj) -> str:
        val = getattr(obj, 'paid_amount', None)
        from decimal import Decimal
        return str(val if val is not None else Decimal('0.00'))

    def validate_name(self, value: str) -> str:
        shop = self.context.get('shop')
        if shop is None:
            return value
        qs = Customer.objects.filter(shop=shop, name__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('Un client avec ce nom existe déjà.')
        return value

    def validate_phone(self, value: str) -> str:
        shop = self.context.get('shop')
        return validated_phone(value, shop.country if shop else '')

    class Meta:
        model = Customer
        fields = (
            'id', 'name', 'first_name', 'display_name', 'phone', 'phone_display', 'email',  # noqa: E501
            'address_line', 'city', 'postal_code', 'country',
            'notes', 'is_active',
            'order_count', 'pending_amount', 'paid_amount', 'last_order_at',
            'created_at', 'updated_at',
        )
        read_only_fields = ('id', 'created_at', 'updated_at')


class CustomerListSerializer(serializers.ModelSerializer):
    order_count = serializers.IntegerField(read_only=True)
    pending_amount = serializers.SerializerMethodField()
    paid_amount = serializers.SerializerMethodField()
    last_order_at = serializers.DateTimeField(read_only=True)
    phone_display = serializers.SerializerMethodField()
    display_name = serializers.CharField(read_only=True)

    def get_phone_display(self, obj: Customer) -> str:
        return format_phone_display(obj.phone)

    def get_pending_amount(self, obj) -> str:
        return str(obj.pending_amount)

    def get_paid_amount(self, obj) -> str:
        return str(obj.paid_amount)

    class Meta:
        model = Customer
        fields = (
            'id', 'name', 'first_name', 'display_name', 'phone', 'phone_display',
            'email', 'city', 'is_active',
            'created_at',
            'order_count', 'pending_amount', 'paid_amount', 'last_order_at',
        )
