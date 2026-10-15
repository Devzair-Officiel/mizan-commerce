import re

from rest_framework import serializers

from apps.core.storage import get_signed_url, is_storage_configured
from apps.invoices.settings import (
    PAYMENT_METHODS,
    resolved_color,
    update_invoice_settings,
)
from .models import Shop


class InvoiceSettingsSerializer(serializers.ModelSerializer):
    logo_url = serializers.SerializerMethodField()
    resolved_color = serializers.SerializerMethodField()
    invoice_color = serializers.RegexField(r'^#[0-9a-fA-F]{6}$')
    invoice_iban = serializers.CharField(
        required=False, allow_blank=True, max_length=80
    )
    invoice_bic = serializers.CharField(required=False, allow_blank=True, max_length=32)
    siret = serializers.CharField(required=False, allow_blank=True, max_length=32)
    invoice_payment_methods = serializers.ListField(
        child=serializers.ChoiceField(choices=PAYMENT_METHODS)
    )
    default_payment_terms_days = serializers.IntegerField(min_value=0, max_value=365)
    default_tax_rate = serializers.DecimalField(
        max_digits=5, decimal_places=2, min_value=0, max_value=100
    )
    legal_mentions = serializers.CharField(
        required=False, allow_blank=True, max_length=2000
    )
    legal_address = serializers.CharField(
        required=False, allow_blank=True, max_length=2000
    )

    class Meta:
        model = Shop
        fields = (
            'name',
            'logo_url',
            'invoice_color_mode',
            'invoice_color',
            'invoice_auto_color',
            'resolved_color',
            'legal_address',
            'tax_id',
            'siret',
            'invoice_vat_regime',
            'vat_number',
            'legal_mentions',
            'default_tax_rate',
            'default_payment_terms_days',
            'invoice_payment_methods',
            'invoice_iban',
            'invoice_bic',
            'invoice_show_account_summary',
            'invoice_show_order',
        )
        read_only_fields = ('name', 'logo_url', 'invoice_auto_color', 'resolved_color')

    def get_logo_url(self, shop: Shop) -> str | None:
        return (
            get_signed_url(shop.logo_object_key)
            if shop.logo_object_key and is_storage_configured()
            else None
        )

    def get_resolved_color(self, shop: Shop) -> str:
        return resolved_color(shop)

    def validate_siret(self, value: str) -> str:
        value = re.sub(r'\s', '', value)
        if value and not re.fullmatch(r'\d{14}', value):
            raise serializers.ValidationError('Le SIRET doit contenir 14 chiffres.')
        return value

    def validate_invoice_iban(self, value: str) -> str:
        value = re.sub(r'\s', '', value).upper()
        if value:
            if not re.fullmatch(r'[A-Z]{2}\d{2}[A-Z0-9]{11,30}', value):
                raise serializers.ValidationError('IBAN invalide.')
            digits = ''.join(
                str(ord(c) - 55) if c.isalpha() else c for c in value[4:] + value[:4]
            )
            if int(digits) % 97 != 1:
                raise serializers.ValidationError('IBAN invalide.')
        return value

    def validate_invoice_bic(self, value: str) -> str:
        value = re.sub(r'\s', '', value).upper()
        if value and not re.fullmatch(r'[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?', value):
            raise serializers.ValidationError('BIC invalide.')
        return value

    def validate(self, attrs: dict) -> dict:
        regime = attrs.get('invoice_vat_regime', self.instance.invoice_vat_regime)
        number = attrs.get('vat_number', self.instance.vat_number).strip()
        if regime == 'applicable' and not number:
            raise serializers.ValidationError(
                {'vat_number': 'Renseignez votre numéro de TVA.'}
            )
        if 'invoice_payment_methods' in attrs:
            attrs['invoice_payment_methods'] = list(
                dict.fromkeys(attrs['invoice_payment_methods'])
            )
        return attrs

    def update(self, instance: Shop, validated_data: dict) -> Shop:
        return update_invoice_settings(instance, validated_data)
