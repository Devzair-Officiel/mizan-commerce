from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from apps.core.recaptcha import verify_recaptcha_token

User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])
    recaptcha_token = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = ('email', 'password', 'full_name', 'phone', 'recaptcha_token')

    def validate(self, attrs):
        token = attrs.get('recaptcha_token', '')
        if not verify_recaptcha_token(token, expected_action='register'):
            raise serializers.ValidationError(
                {'recaptcha_token': 'Vérification anti-bot échouée. Réessayez.'}
            )
        return attrs

    def create(self, validated_data):
        validated_data.pop('recaptcha_token', None)
        return User.objects.create_user(**validated_data)


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'email', 'full_name', 'phone', 'email_verified_at', 'created_at')
        read_only_fields = ('id', 'email_verified_at', 'created_at')


class MeSerializer(UserSerializer):
    """`/api/me/` — étend `UserSerializer` avec l'appartenance boutique (rôle + modules)."""

    membership = serializers.SerializerMethodField()

    class Meta(UserSerializer.Meta):
        fields = UserSerializer.Meta.fields + ('membership',)

    def get_membership(self, user):
        from apps.shops.models import ShopMember

        m = ShopMember.objects.filter(user=user).select_related('shop').first()
        if m is None:
            return None
        return {
            'shop_id': str(m.shop.id),
            'shop_name': m.shop.name,
            'role': m.role,
            'is_admin': m.is_admin,
            'permissions': list(m.permissions or []),
            # Onboarding : `onboarding_completed_at` null = wizard à présenter.
            'catalog_kind': m.shop.catalog_kind,
            'dashboard_mode': m.shop.dashboard_mode,
            'onboarding_completed_at': (
                m.shop.onboarding_completed_at.isoformat()
                if m.shop.onboarding_completed_at else None
            ),
        }


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, validators=[validate_password])


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True, validators=[validate_password])
