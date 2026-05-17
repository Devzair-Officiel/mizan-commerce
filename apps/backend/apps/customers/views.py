from rest_framework import generics, filters
from rest_framework.permissions import IsAuthenticated

from apps.shops.models import ShopMember
from .models import Customer
from .serializers import CustomerSerializer, CustomerListSerializer


def get_shop(user):
    membership = ShopMember.objects.filter(user=user).select_related('shop').first()
    if not membership:
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied('Aucune boutique associée.')
    return membership.shop


class CustomerListCreateView(generics.ListCreateAPIView):
    permission_classes = (IsAuthenticated,)
    filter_backends = (filters.SearchFilter, filters.OrderingFilter)
    search_fields = ('name', 'phone', 'email', 'city')
    ordering_fields = ('name', 'created_at')
    ordering = ('name',)

    def get_serializer_class(self):
        return CustomerListSerializer if self.request.method == 'GET' else CustomerSerializer

    def get_queryset(self):
        shop = get_shop(self.request.user)
        qs = Customer.objects.filter(shop=shop)
        if self.request.query_params.get('all') != '1':
            qs = qs.filter(is_active=True)
        return qs

    def perform_create(self, serializer):
        serializer.save(shop=get_shop(self.request.user))


class CustomerDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = (IsAuthenticated,)
    serializer_class = CustomerSerializer

    def get_queryset(self):
        return Customer.objects.filter(shop=get_shop(self.request.user))

    def perform_destroy(self, instance):
        # Soft delete
        instance.is_active = False
        instance.save(update_fields=['is_active', 'updated_at'])
