"""Sérialiseurs des devis (URS-111) : lecture seule, mutations par payloads dédiés."""

from rest_framework import serializers

from apps.core.storage import get_signed_url, is_storage_configured
from apps.invoices.serializers import (
    DraftInvoiceSerializer,
    InvoiceIssueDraftSerializer,
    InvoiceLineSerializer,
)

from .models import Quote, QuoteLine


class QuoteLineSerializer(InvoiceLineSerializer):
    class Meta(InvoiceLineSerializer.Meta):
        model = QuoteLine


class QuoteSerializer(serializers.ModelSerializer):
    """Lecture seule : brouillon, envoi et statut passent par des endpoints dédiés."""

    lines = QuoteLineSerializer(many=True, read_only=True)
    logo_url = serializers.SerializerMethodField()

    def get_logo_url(self, quote: Quote) -> str | None:
        key = quote.presentation.get('logo_object_key')
        return get_signed_url(key) if key and is_storage_configured() else None

    class Meta:
        model = Quote
        fields = (
            'id',
            'customer',
            'invoice',
            'number',
            'status',
            'operation_category',
            'validity_days',
            'valid_until',
            'payment_terms_days',
            'sent_at',
            'viewed_at',
            'accepted_at',
            'accepted_name',
            'declined_at',
            'seller_name',
            'seller_address',
            'seller_tax_id',
            'seller_legal_mentions',
            'seller_country',
            'buyer_name',
            'buyer_address',
            'buyer_city',
            'buyer_postal_code',
            'buyer_country',
            'buyer_email',
            'buyer_phone',
            'buyer_siren',
            'currency',
            'tax_rate',
            'subtotal_ht',
            'discount_amount',
            'shipping_amount',
            'tax_amount',
            'total_ttc',
            'presentation',
            'logo_url',
            'notes',
            'lines',
            'created_at',
            'updated_at',
        )
        read_only_fields = fields


class DraftQuoteSerializer(DraftInvoiceSerializer):
    """Création d'un brouillon de devis : champs du brouillon de facture, plus la
    durée de validité ; rien n'est vérifié avant l'envoi (`compliance.check_quote`)."""

    validity_days = serializers.IntegerField(required=False, min_value=1, max_value=365)


class DraftQuoteUpdateSerializer(DraftQuoteSerializer):
    """PATCH partiel : `updated_at` lu par le client, refusé s'il n'est plus à jour."""

    updated_at = serializers.DateTimeField()


class QuoteSendSerializer(InvoiceIssueDraftSerializer):
    """Envoi : codes des recommandations acceptées en connaissance de cause."""


class QuoteStatusSerializer(serializers.Serializer):
    """Transitions manuelles seulement : `sent`, `expired` et `invoiced` ont leur
    propre chemin (envoi, tâche quotidienne, conversion)."""

    status = serializers.ChoiceField(
        choices=[Quote.STATUS_ACCEPTED, Quote.STATUS_DECLINED]
    )
    accepted_name = serializers.CharField(
        required=False, allow_blank=True, max_length=200
    )
