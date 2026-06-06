from __future__ import annotations

from rest_framework import serializers

from .models import PreparedMessage


class PreparedMessageSerializer(serializers.ModelSerializer):
    """Lecture : représentation complète d'un message préparé."""

    template_type_display = serializers.CharField(source='get_template_type_display', read_only=True)
    context_type_display = serializers.CharField(source='get_context_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = PreparedMessage
        fields = (
            'id',
            'template_type',
            'template_type_display',
            'context_type',
            'context_type_display',
            'context_id',
            'customer',
            'recipient_name',
            'recipient_phone',
            'message',
            'status',
            'status_display',
            'sent_manually_at',
            'created_at',
            'updated_at',
        )
        read_only_fields = (
            'id',
            'recipient_name',
            'recipient_phone',
            'sent_manually_at',
            'created_at',
            'updated_at',
        )


class PreparedMessageUpdateSerializer(serializers.ModelSerializer):
    """PATCH /messages/prepared/<id>/ — édition du texte uniquement.

    Le statut (`prepared` → `sent_manually` / `archived`) passe par les
    endpoints dédiés ; le template et le contexte ne sont jamais modifiables
    après création (sinon il faut recréer un message).
    """

    class Meta:
        model = PreparedMessage
        fields = ('message',)

    def validate_message(self, value: str) -> str:
        if not value or not value.strip():
            raise serializers.ValidationError('Le message ne peut pas être vide.')
        return value


class PreparedMessageCreateSerializer(serializers.Serializer):
    """Écriture : input d'un POST /messages/prepared/.

    Le serveur résout le contexte et rend le texte ; le client peut passer
    `custom_message` pour outrepasser le template rendu (utile pour l'édition
    immédiate côté frontend).
    """

    template_type = serializers.ChoiceField(choices=PreparedMessage.TemplateType.choices)
    context_type = serializers.ChoiceField(
        choices=PreparedMessage.ContextType.choices,
        default=PreparedMessage.ContextType.NONE,
    )
    context_id = serializers.UUIDField(required=False, allow_null=True)
    customer_id = serializers.UUIDField(required=False, allow_null=True)
    custom_message = serializers.CharField(required=False, allow_blank=True, max_length=4000)

    def validate(self, data):
        template_type = data['template_type']
        context_type = data.get('context_type', PreparedMessage.ContextType.NONE)
        context_id = data.get('context_id')

        if template_type == PreparedMessage.TemplateType.FREE:
            if not (data.get('custom_message') or '').strip():
                raise serializers.ValidationError(
                    {'custom_message': 'Le contenu du message libre est requis.'}
                )

        needs_context = template_type in (
            PreparedMessage.TemplateType.ORDER_CONFIRMATION,
            PreparedMessage.TemplateType.TRACKING,
            PreparedMessage.TemplateType.UNPAID_FOLLOWUP,
        )
        if needs_context:
            if context_type != PreparedMessage.ContextType.ORDER or not context_id:
                raise serializers.ValidationError(
                    {'context_id': 'Une commande est requise pour ce template.'}
                )

        return data
