from __future__ import annotations

from rest_framework import serializers

from .models import MessageSettings, PreparedMessage
from .services import (
    LANGUAGES,
    MAX_TEXT_LENGTH,
    TEMPLATE_KEYS,
    VARIABLES,
    unknown_variables,
)


class PreparedMessageSerializer(serializers.ModelSerializer):
    """Lecture : représentation complète d'un message préparé."""

    template_type_display = serializers.CharField(source='get_template_type_display', read_only=True)  # noqa: E501
    context_type_display = serializers.CharField(source='get_context_type_display', read_only=True)  # noqa: E501
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

    template_type = serializers.ChoiceField(choices=PreparedMessage.TemplateType.choices)  # noqa: E501
    context_type = serializers.ChoiceField(
        choices=PreparedMessage.ContextType.choices,
        default=PreparedMessage.ContextType.NONE,
    )
    context_id = serializers.UUIDField(required=False, allow_null=True)
    customer_id = serializers.UUIDField(required=False, allow_null=True)
    custom_message = serializers.CharField(required=False, allow_blank=True, max_length=4000)  # noqa: E501
    # WhatsApp s'ouvre avec ce texte : enregistré directement comme envoyé.
    sent = serializers.BooleanField(required=False, default=False)

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
            PreparedMessage.TemplateType.THANK_YOU,
        )
        # Relance depuis la fiche client : un message composé pour ses commandes dues.
        customer_followup = (
            template_type == PreparedMessage.TemplateType.UNPAID_FOLLOWUP
            and context_type == PreparedMessage.ContextType.CUSTOMER
            and context_id
            and (data.get('custom_message') or '').strip()
        )
        if needs_context and not customer_followup:
            if context_type != PreparedMessage.ContextType.ORDER or not context_id:
                raise serializers.ValidationError(
                    {'context_id': 'Une commande est requise pour ce template.'}
                )

        return data


def _allowed_variables() -> list[str]:
    return [f'{{{name}}}' for name in VARIABLES]


def _unknown_message(names: list[str]) -> str:
    unknown = ', '.join(f'{{{name}}}' for name in names)
    return f'Variable inconnue : {unknown}. Variables permises : {", ".join(_allowed_variables())}.'  # noqa: E501


class MessageSettingsUpdateSerializer(serializers.Serializer):
    """PATCH /messages/settings/ : ton, et textes par modèle (`null` = texte du ton choisi)."""  # noqa: E501

    tone = serializers.ChoiceField(choices=MessageSettings.Tone.choices, required=False)
    texts = serializers.DictField(
        child=serializers.CharField(
            allow_null=True, allow_blank=True,
            max_length=MAX_TEXT_LENGTH, trim_whitespace=False,
        ),
        required=False,
    )

    def validate_texts(self, value: dict[str, str | None]) -> dict[str, str | None]:
        errors: dict[str, list[str]] = {}
        cleaned: dict[str, str | None] = {}
        for key, text in value.items():
            if key not in TEMPLATE_KEYS:
                errors[key] = ['Modèle inconnu.']
                continue
            if text is None:
                cleaned[key] = None
                continue
            text = text.strip()
            if not text:
                errors[key] = ['Le texte ne peut pas être vide.']
            elif names := unknown_variables(text):
                errors[key] = [_unknown_message(names)]
            else:
                cleaned[key] = text
        if errors:
            raise serializers.ValidationError(errors)
        return cleaned

    def validate(self, data: dict) -> dict:
        if 'tone' not in data and 'texts' not in data:
            raise serializers.ValidationError('Rien à enregistrer.')
        return data

    def to_validation_error(self) -> dict:
        """Erreurs au format de l'API (`detail`, `errors`) et variables permises."""
        return {
            'detail': 'Requête invalide.',
            'errors': self.errors,
            'allowed_variables': _allowed_variables(),
        }


class MessagePreviewSerializer(serializers.Serializer):
    """POST /messages/preview/ : texte à rendre, ton et langue de l'aperçu."""

    text = serializers.CharField(max_length=MAX_TEXT_LENGTH, allow_blank=True, trim_whitespace=False)  # noqa: E501
    tone = serializers.ChoiceField(choices=MessageSettings.Tone.choices, required=False)
    lang = serializers.ChoiceField(choices=LANGUAGES, required=False)


class MessageComposeSerializer(serializers.Serializer):
    """POST /messages/compose/ : texte d'un message pour une commande ou un client."""

    template = serializers.ChoiceField(
        choices=PreparedMessage.TemplateType.choices, required=False, allow_null=True,
    )
    order_id = serializers.UUIDField(required=False, allow_null=True)
    customer_id = serializers.UUIDField(required=False, allow_null=True)
    lang = serializers.ChoiceField(choices=LANGUAGES, required=False)

    def validate(self, data: dict) -> dict:
        if not data.get('order_id') and not data.get('customer_id'):
            raise serializers.ValidationError('Une commande ou un client est requis.')
        return data
