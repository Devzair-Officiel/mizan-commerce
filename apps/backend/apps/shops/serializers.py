from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from apps.core.storage import get_signed_url, is_storage_configured

from .models import Shop, ShopMember


class ShopSerializer(serializers.ModelSerializer):
    logo_url = serializers.SerializerMethodField()

    class Meta:
        model = Shop
        fields = (
            'id', 'name', 'currency', 'country', 'timezone',
            'zakat_annual_date', 'nisab_method', 'nisab_unit_price',
            'logo_object_key', 'logo_url',
            'legal_address', 'tax_id', 'legal_mentions',
            'default_tax_rate', 'default_payment_terms_days',
            'created_at', 'updated_at',
        )
        read_only_fields = (
            'id', 'timezone', 'logo_object_key', 'logo_url', 'created_at', 'updated_at',
        )

    def get_logo_url(self, obj: Shop) -> str | None:
        if not obj.logo_object_key or not is_storage_configured():
            return None
        return get_signed_url(obj.logo_object_key)


class ShopMemberSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source='user.email', read_only=True)
    user_full_name = serializers.CharField(source='user.full_name', read_only=True)
    user_phone = serializers.CharField(source='user.phone', read_only=True)

    class Meta:
        model = ShopMember
        fields = (
            'id', 'user', 'user_email', 'user_full_name', 'user_phone',
            'role', 'permissions', 'created_at',
        )
        read_only_fields = ('id', 'created_at')


class ShopMemberCreateSerializer(serializers.Serializer):
    email = serializers.EmailField()
    full_name = serializers.CharField(max_length=120)
    phone = serializers.CharField(max_length=30, allow_blank=True, default='')
    password = serializers.CharField(write_only=True, validators=[validate_password])
    permissions = serializers.ListField(
        child=serializers.CharField(), allow_empty=True, default=list,
    )


class ShopMemberUpdateSerializer(serializers.Serializer):
    role = serializers.ChoiceField(
        choices=[ShopMember.ROLE_ADMIN, ShopMember.ROLE_STAFF],
        required=False,
    )
    permissions = serializers.ListField(
        child=serializers.CharField(), required=False,
    )


class AdminShopMemberSerializer(serializers.ModelSerializer):
    user_id = serializers.UUIDField(source='user.id', read_only=True)
    user_email = serializers.EmailField(source='user.email', read_only=True)
    user_full_name = serializers.CharField(source='user.full_name', read_only=True)
    user_phone = serializers.CharField(source='user.phone', read_only=True)

    class Meta:
        model = ShopMember
        fields = ('user_id', 'user_email', 'user_full_name', 'user_phone', 'role', 'created_at')


class AdminShopSerializer(serializers.ModelSerializer):
    members = AdminShopMemberSerializer(many=True, read_only=True)
    member_count = serializers.SerializerMethodField()

    class Meta:
        model = Shop
        fields = (
            'id', 'name', 'currency', 'country', 'timezone',
            'zakat_annual_date', 'created_at', 'updated_at',
            'member_count', 'members',
        )

    def get_member_count(self, obj):
        return obj.members.count()
