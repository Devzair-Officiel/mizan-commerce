from decimal import Decimal

from rest_framework import serializers
from apps.core.storage import get_signed_url, is_storage_configured

from .models import Invoice, InvoiceLine
from .services import display_line_description

MAX_DRAFT_LINES = 200


class InvoiceLineSerializer(serializers.ModelSerializer):
    description = serializers.SerializerMethodField()

    class Meta:
        model = InvoiceLine
        fields = (
            'id', 'description', 'details', 'unit', 'position',
            'quantity', 'unit_price_ht', 'line_subtotal_ht',
        )
        read_only_fields = fields

    def get_description(self, line: InvoiceLine) -> str:
        return display_line_description(line.description)


class InvoiceSerializer(serializers.ModelSerializer):
    """Sérialiseur lecture seule — l'émission passe par un endpoint dédié.

    Le seul champ modifiable via PATCH côté API est `status` (cf. `InvoiceStatusUpdateSerializer`).
    Exposer ce sérialiseur en `ModelSerializer` complet faciliterait la triche : on garde
    tout en read-only ici et on contrôle finement les mutations dans des sérialiseurs séparés.
    """  # noqa: E501

    lines = InvoiceLineSerializer(many=True, read_only=True)
    logo_url = serializers.SerializerMethodField()
    # Avoirs (URS-112). Sur une facture : montant crédité, avoirs liés et
    # « entièrement créditée ». Sur un avoir : facture d'origine et motif.
    fully_credited = serializers.BooleanField(
        source='is_fully_credited', read_only=True,
    )
    credit_notes = serializers.SerializerMethodField()
    credited_number = serializers.SerializerMethodField()
    credited_issued_date = serializers.SerializerMethodField()

    def get_logo_url(self, invoice: Invoice) -> str | None:
        key = invoice.presentation.get('logo_object_key')
        return get_signed_url(key) if key and is_storage_configured() else None

    def get_credit_notes(self, invoice: Invoice) -> list[dict[str, str]]:
        # Préchargés par les vues de liste et de détail (`listing.with_relations`).
        return [
            {
                'id': str(note.pk),
                'number': note.number,
                'total_ttc': str(note.total_ttc),
            }
            for note in invoice.credit_notes.all()
            if note.shop_id == invoice.shop_id
        ]

    def get_credited_number(self, invoice: Invoice) -> str:
        return invoice.presentation.get('credited_number', '')

    def get_credited_issued_date(self, invoice: Invoice) -> str:
        return invoice.presentation.get('credited_issued_date', '')

    class Meta:
        model = Invoice
        fields = (
            'id', 'order', 'customer', 'number', 'kind', 'status',
            'operation_category', 'payment_terms_days',
            'issued_at', 'due_date', 'paid_at', 'cancelled_at',
            'seller_name', 'seller_address', 'seller_tax_id', 'seller_legal_mentions',
            'seller_country',
            'buyer_name', 'buyer_address', 'buyer_city', 'buyer_postal_code',
            'buyer_country', 'buyer_email', 'buyer_phone', 'buyer_siren',
            'currency', 'tax_rate', 'subtotal_ht',
            'discount_amount', 'shipping_amount',
            'tax_amount', 'total_ttc',
            'amount_paid', 'presentation', 'logo_url',
            'credited_total', 'fully_credited', 'credit_notes',
            'credited_invoice', 'credited_number', 'credited_issued_date',
            'credit_reason',
            'notes', 'lines',
            'created_at', 'updated_at',
        )
        read_only_fields = fields


class InvoiceIssueSerializer(serializers.Serializer):
    """Payload d'émission — `order_id` requis, le reste est optionnel et surcharge les défauts shop."""  # noqa: E501

    order_id = serializers.UUIDField()
    tax_rate = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False, min_value=0, max_value=100,
    )
    payment_terms_days = serializers.IntegerField(required=False, min_value=0, max_value=365)  # noqa: E501
    notes = serializers.CharField(required=False, allow_blank=True, max_length=2000)


class InvoiceStatusUpdateSerializer(serializers.Serializer):
    """PATCH — accepte uniquement les transitions vers `paid` ou `cancelled`."""

    status = serializers.ChoiceField(choices=[Invoice.STATUS_PAID, Invoice.STATUS_CANCELLED])  # noqa: E501


class DraftLineSerializer(serializers.Serializer):
    """Ligne libre d'un brouillon : description courte, détails sur plusieurs lignes."""

    description = serializers.CharField(max_length=300)
    details = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    unit = serializers.CharField(required=False, allow_blank=True, max_length=30)
    quantity = serializers.DecimalField(
        max_digits=12, decimal_places=3, min_value=Decimal('0.001'),
    )
    unit_price_ht = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal('0'),
    )


class DraftInvoiceSerializer(serializers.Serializer):
    """Création d'un brouillon (URS-110) : tout est facultatif, rien n'est vérifié
    avant l'émission (cf. `compliance.check_invoice`)."""

    customer = serializers.UUIDField(required=False, allow_null=True)
    operation_category = serializers.ChoiceField(
        choices=Invoice.OPERATION_CHOICES, required=False,
    )
    payment_terms_days = serializers.IntegerField(
        required=False, allow_null=True, min_value=0, max_value=365,
    )
    discount_amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal('0'), required=False,
    )
    shipping_amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal('0'), required=False,
    )
    notes = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    lines = DraftLineSerializer(many=True, required=False, max_length=MAX_DRAFT_LINES)


class DraftInvoiceUpdateSerializer(DraftInvoiceSerializer):
    """PATCH partiel : `updated_at` lu par le client, refusé s'il n'est plus à jour."""

    updated_at = serializers.DateTimeField()


class InvoiceIssueDraftSerializer(serializers.Serializer):
    """Émission d'un brouillon : codes des recommandations acceptées en connaissance de cause."""  # noqa: E501

    acknowledged_warnings = serializers.ListField(
        child=serializers.CharField(max_length=40), required=False, max_length=20,
    )


class CreditNoteLineSerializer(serializers.Serializer):
    """Ligne de la facture à créditer et quantité à la baisse."""

    line = serializers.UUIDField()
    quantity = serializers.DecimalField(
        max_digits=12, decimal_places=3, min_value=Decimal('0.001'),
    )


class CreditNoteIssueSerializer(serializers.Serializer):
    """Émission d'un avoir (URS-112) : `total` crédite tout le reste de la facture ;
    `partial` les lignes listées (éventuellement aucune) et la livraison au choix.
    Bornes et reste à créditer : vérifiés par `credit_notes.issue_credit_note`."""

    MODE_TOTAL = 'total'
    MODE_PARTIAL = 'partial'

    mode = serializers.ChoiceField(choices=[MODE_TOTAL, MODE_PARTIAL])
    reason = serializers.CharField(max_length=500)
    lines = CreditNoteLineSerializer(
        many=True, required=False, max_length=MAX_DRAFT_LINES,
    )
    include_shipping = serializers.BooleanField(required=False, default=False)
    acknowledged_warnings = serializers.ListField(
        child=serializers.CharField(max_length=40), required=False, max_length=20,
    )

    def validate(self, data: dict) -> dict:
        if data['mode'] == self.MODE_TOTAL and data.get('lines'):
            raise serializers.ValidationError(
                {'lines': 'Un avoir total reprend toute la facture : aucune ligne à choisir.'}  # noqa: E501
            )
        return data
