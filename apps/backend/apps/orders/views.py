from decimal import Decimal

from django.db import transaction
from rest_framework import generics, filters, status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import HasModulePermission, get_shop
from apps.subscriptions.permissions import HasPlanForFeature

HasOrdersModule = HasModulePermission.for_module('orders')
HasOrdersPlan = HasPlanForFeature.for_feature('orders')
from apps.customers.models import Customer
from apps.products.models import ProductVariant
from apps.notes.models import Note
from . import services
from .models import Order, OrderItem
from .serializers import (
    OrderSerializer, OrderListSerializer, OrderCreateSerializer,
    OrderItemSerializer, OrderItemCreateSerializer,
    OrderItemQuantitySerializer, StatusTransitionSerializer, PaymentUpdateSerializer,
)


class OrderListCreateView(generics.ListAPIView):
    permission_classes = (IsAuthenticated, HasOrdersPlan, HasOrdersModule)
    filter_backends = (filters.OrderingFilter,)
    ordering_fields = ('created_at', 'total_amount')
    ordering = ('-created_at',)

    def get_serializer_class(self):
        return OrderListSerializer

    def get_queryset(self):
        shop = get_shop(self.request.user)
        qs = Order.objects.filter(shop=shop).select_related('customer').prefetch_related('items')
        status_filter = self.request.query_params.get('status')
        payment_filter = self.request.query_params.get('payment_status')
        customer_filter = self.request.query_params.get('customer')
        if status_filter:
            qs = qs.filter(status=status_filter)
        if payment_filter:
            qs = qs.filter(payment_status=payment_filter)
        if customer_filter:
            qs = qs.filter(customer_id=customer_filter)
        return qs

    def post(self, request, *args, **kwargs):
        shop = get_shop(request.user)
        serializer = OrderCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data

        customer = None
        if d.get('customer'):
            try:
                customer = Customer.objects.get(pk=d['customer'], shop=shop)
            except Customer.DoesNotExist:
                return Response({'customer': 'Client introuvable.'}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            order = services.create_order(
                shop=shop, user=request.user, customer=customer,
                discount=d['discount_amount'], shipping=d['shipping_amount'],
            )

            for item_data in d.get('items', []):
                variant = None
                if item_data.get('variant'):
                    try:
                        variant = (
                            ProductVariant.objects
                            .select_related('product')
                            .get(pk=item_data['variant'], shop=shop, is_active=True, product__is_active=True)
                        )
                    except ProductVariant.DoesNotExist:
                        raise ValidationError({'items': f"Variante {item_data['variant']} introuvable."})
                services.add_item(
                    order,
                    variant=variant,
                    quantity=item_data['quantity'],
                    unit_price=item_data.get('unit_price'),
                    product_name=item_data.get('product_name'),
                )

            order.refresh_from_db()

            payment_status = d.get('payment_status', 'unpaid')
            if payment_status == 'paid':
                services.update_payment(order, order.total_amount, user=request.user)
            elif payment_status == 'partial':
                amount_paid = d.get('amount_paid', Decimal('0'))
                if amount_paid > order.total_amount:
                    raise ValidationError({
                        'amount_paid': 'Le montant reçu ne peut pas dépasser le total.',
                    })
                services.update_payment(order, amount_paid, user=request.user)

            target_status = d.get('status', 'draft')
            # Chaîne les transitions pour atteindre le statut cible depuis 'draft'.
            transition_path = {
                'draft':      [],
                'to_prepare': ['to_prepare'],
                'prepared':   ['to_prepare', 'prepared'],
                'shipped':    ['to_prepare', 'prepared', 'shipped'],
            }
            for step in transition_path.get(target_status, []):
                services.transition_status(order, step, request.user)

            initial_note = (d.get('notes') or '').strip()
            if initial_note:
                Note.objects.create(
                    shop=shop, order=order, author=request.user, content=initial_note,
                )

        order.refresh_from_db()
        return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)


class OrderDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = (IsAuthenticated, HasOrdersPlan, HasOrdersModule)
    serializer_class = OrderSerializer

    def get_queryset(self):
        shop = get_shop(self.request.user)
        return Order.objects.filter(shop=shop).select_related('customer').prefetch_related('items')

    def perform_destroy(self, instance):
        raise Exception("Suppression interdite. Utilisez l'annulation.")

    def update(self, request, *args, **kwargs):
        # Seuls notes, discount et shipping sont modifiables directement
        order = self.get_object()
        if order.status not in ('draft',):
            return Response(
                {'detail': 'Seules les commandes en brouillon peuvent être modifiées.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        allowed_fields = {'discount_amount', 'shipping_amount', 'customer'}
        data = {k: v for k, v in request.data.items() if k in allowed_fields}
        serializer = self.get_serializer(order, data=data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        services.recalculate_totals(order)
        order.refresh_from_db()
        return Response(OrderSerializer(order).data)


class OrderStatusView(APIView):
    """Change le statut d'une commande avec toutes les règles métier associées."""
    permission_classes = (IsAuthenticated, HasOrdersPlan, HasOrdersModule)

    def post(self, request, pk):
        shop = get_shop(request.user)
        try:
            order = Order.objects.get(pk=pk, shop=shop)
        except Order.DoesNotExist:
            return Response({'detail': 'Commande introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = StatusTransitionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            order = services.transition_status(order, serializer.validated_data['status'], request.user)
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(OrderSerializer(order).data)


class OrderPaymentView(APIView):
    """Met à jour le montant payé et le statut de paiement."""
    permission_classes = (IsAuthenticated, HasOrdersPlan, HasOrdersModule)

    def post(self, request, pk):
        shop = get_shop(request.user)
        try:
            order = Order.objects.get(pk=pk, shop=shop)
        except Order.DoesNotExist:
            return Response({'detail': 'Commande introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        if order.status == 'cancelled':
            return Response({'detail': 'Impossible de modifier le paiement d\'une commande annulée.'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = PaymentUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = services.update_payment(
            order, serializer.validated_data['amount_paid'], user=request.user,
        )
        return Response(OrderSerializer(order).data)


class OrderActivityView(APIView):
    """Retourne la timeline d'activité d'une commande (création, statuts, paiements, notes)."""
    permission_classes = (IsAuthenticated, HasOrdersPlan, HasOrdersModule)

    def get(self, request, pk):
        shop = get_shop(request.user)
        try:
            order = Order.objects.get(pk=pk, shop=shop)
        except Order.DoesNotExist:
            return Response({'detail': 'Commande introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        events = services.get_order_timeline(order)
        return Response({'events': events})


class OrderItemCreateView(APIView):
    """Ajoute un article à une commande en brouillon."""
    permission_classes = (IsAuthenticated, HasOrdersPlan, HasOrdersModule)

    def post(self, request, pk):
        shop = get_shop(request.user)
        try:
            order = Order.objects.get(pk=pk, shop=shop)
        except Order.DoesNotExist:
            return Response({'detail': 'Commande introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = OrderItemCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data

        variant = None
        if d.get('variant'):
            try:
                variant = (
                    ProductVariant.objects
                    .select_related('product')
                    .get(pk=d['variant'], shop=shop, is_active=True, product__is_active=True)
                )
            except ProductVariant.DoesNotExist:
                return Response({'detail': 'Variante introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            item = services.add_item(
                order,
                variant=variant,
                quantity=d['quantity'],
                unit_price=d.get('unit_price'),
                product_name=d.get('product_name'),
            )
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(OrderItemSerializer(item).data, status=status.HTTP_201_CREATED)


class OrderItemUpdateView(APIView):
    """PATCH → met à jour la quantité / DELETE → retire l'article (commande en brouillon)."""
    permission_classes = (IsAuthenticated, HasOrdersPlan, HasOrdersModule)

    def _get_objects(self, request, pk, item_pk):
        shop = get_shop(request.user)
        try:
            order = Order.objects.get(pk=pk, shop=shop)
            item = OrderItem.objects.get(pk=item_pk, order=order)
        except (Order.DoesNotExist, OrderItem.DoesNotExist):
            return None, None
        return order, item

    def patch(self, request, pk, item_pk):
        order, item = self._get_objects(request, pk, item_pk)
        if order is None:
            return Response({'detail': 'Introuvable.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = OrderItemQuantitySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            item = services.update_item_quantity(order, item, serializer.validated_data['quantity'])
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(OrderItemSerializer(item).data)

    def delete(self, request, pk, item_pk):
        order, item = self._get_objects(request, pk, item_pk)
        if order is None:
            return Response({'detail': 'Introuvable.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            services.remove_item(order, item)
        except ValueError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(status=status.HTTP_204_NO_CONTENT)
