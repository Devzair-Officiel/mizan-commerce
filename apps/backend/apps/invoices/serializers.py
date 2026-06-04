from rest_framework import serializers

from .models import Invoice, InvoiceLine


class InvoiceLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoiceLine
        fields = (
            'id', 'description', 'quantity', 'unit_price_ht', 'line_subtotal_ht',
        )
        read_only_fields = fields


class InvoiceSerializer(serializers.ModelSerializer):
    """Sérialiseur lecture seule — l'émission passe par un endpoint dédié.

    Le seul champ modifiable via PATCH côté API est `status` (cf. `InvoiceStatusUpdateSerializer`).
    Exposer ce sérialiseur en `ModelSerializer` complet faciliterait la triche : on garde
    tout en read-only ici et on contrôle finement les mutations dans des sérialiseurs séparés.
    """

    lines = InvoiceLineSerializer(many=True, read_only=True)

    class Meta:
        model = Invoice
        fields = (
            'id', 'order', 'customer', 'number', 'status',
            'issued_at', 'due_date', 'paid_at', 'cancelled_at',
            'seller_name', 'seller_address', 'seller_tax_id', 'seller_legal_mentions',
            'seller_country',
            'buyer_name', 'buyer_address', 'buyer_city', 'buyer_postal_code',
            'buyer_country', 'buyer_email', 'buyer_phone',
            'currency', 'tax_rate', 'subtotal_ht',
            'discount_amount', 'shipping_amount',
            'tax_amount', 'total_ttc',
            'amount_paid',
            'notes', 'lines',
            'created_at', 'updated_at',
        )
        read_only_fields = fields


class InvoiceIssueSerializer(serializers.Serializer):
    """Payload d'émission — `order_id` requis, le reste est optionnel et surcharge les défauts shop."""

    order_id = serializers.UUIDField()
    tax_rate = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False, min_value=0, max_value=100,
    )
    payment_terms_days = serializers.IntegerField(required=False, min_value=0, max_value=365)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=2000)


class InvoiceStatusUpdateSerializer(serializers.Serializer):
    """PATCH — accepte uniquement les transitions vers `paid` ou `cancelled`."""

    status = serializers.ChoiceField(choices=[Invoice.STATUS_PAID, Invoice.STATUS_CANCELLED])
