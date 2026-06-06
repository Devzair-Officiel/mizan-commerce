from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])

    class Meta:
        model = User
        fields = ('email', 'password', 'full_name', 'phone')

    def create(self, validated_data):
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
