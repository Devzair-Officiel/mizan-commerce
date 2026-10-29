from rest_framework import serializers

from .export_texts import EXPORT_TEXTS
from .models import Customer
from .services import (
    ALL_TYPES, InvalidPhoneNumber, format_phone_display, normalize_phone,
)

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
    # Saisie libre (« 123 456 789 ») : normalisée par `validate_siren`.
    siren = serializers.CharField(required=False, allow_blank=True, max_length=20)

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

    def validate_siren(self, value: str) -> str:
        """9 chiffres, espaces de saisie retirés ; aucune clé de contrôle vérifiée."""
        siren = ''.join(value.split())
        if siren and not (len(siren) == 9 and siren.isascii() and siren.isdigit()):
            raise serializers.ValidationError('Le SIREN compte 9 chiffres.')
        return siren

    class Meta:
        model = Customer
        fields = (
            'id', 'name', 'first_name', 'display_name', 'phone', 'phone_display', 'email',  # noqa: E501
            'address_line', 'city', 'postal_code', 'country',
            'customer_type', 'siren',
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
            'email', 'city', 'customer_type', 'is_active',
            'created_at',
            'order_count', 'pending_amount', 'paid_amount', 'last_order_at',
        )




class ActivityExportQuerySerializer(serializers.Serializer):
    """Filtres de l'export de l'activité : ceux de la timeline, plus une période."""

    # `allow_blank` : `types=` vide est refusé (DRF l'ignorerait : tous les types).
    types = serializers.CharField(required=False, allow_blank=True)
    pending = serializers.BooleanField(required=False, default=False)
    # Langue de l'interface : en-têtes, libellés et séparateur décimal du fichier.
    lang = serializers.ChoiceField(choices=sorted(EXPORT_TEXTS), required=False)

    def get_fields(self):
        # `from` est un mot réservé : les dates arrivent en `from`/`to`.
        fields = super().get_fields()
        fields['from'] = serializers.DateField(required=False, source='date_from')
        fields['to'] = serializers.DateField(required=False, source='date_to')
        return fields

    def validate_types(self, value: str) -> list[str]:
        requested = {t.strip() for t in value.split(',') if t.strip()}
        if not requested:
            raise serializers.ValidationError('Choisissez au moins un type.')
        if requested - ALL_TYPES:
            raise serializers.ValidationError('Type inconnu.')
        return sorted(requested)

    def validate(self, attrs: dict) -> dict:
        start, end = attrs.get('date_from'), attrs.get('date_to')
        if start and end and start > end:
            raise serializers.ValidationError({'to': 'La fin précède le début.'})
        return attrs
