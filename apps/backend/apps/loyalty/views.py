from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.pagination import FlexiblePageNumberPagination
from apps.core.permissions import HasModulePermission, IsShopAdmin, get_shop

from .models import LoyaltyCard, LoyaltyTransaction
from .serializers import (
    AdjustPointsSerializer,
    EarnPointsSerializer,
    LoyaltyCardListSerializer,
    LoyaltyCardSerializer,
    LoyaltyProgramSerializer,
    LoyaltyTransactionSerializer,
    RedeemPointsSerializer,
)
from .services import (
    adjust_points,
    earn_points,
    get_or_create_program,
    redeem_points,
)

HasLoyaltyModule = HasModulePermission.for_module('loyalty')


class LoyaltyProgramView(APIView):
    permission_classes = (IsAuthenticated, HasLoyaltyModule)

    def get(self, request: Request) -> Response:
        program = get_or_create_program(get_shop(request.user))
        return Response(LoyaltyProgramSerializer(program).data)

    def patch(self, request: Request) -> Response:
        program = get_or_create_program(get_shop(request.user))
        serializer = LoyaltyProgramSerializer(program, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class LoyaltyCardListView(generics.ListAPIView):
    permission_classes = (IsAuthenticated, HasLoyaltyModule)
    serializer_class = LoyaltyCardListSerializer

    def get_queryset(self):
        return (
            LoyaltyCard.objects.filter(shop=get_shop(self.request.user))
            .select_related('customer')
        )


class LoyaltyCardDetailView(generics.RetrieveAPIView):
    permission_classes = (IsAuthenticated, HasLoyaltyModule)
    serializer_class = LoyaltyCardSerializer

    def get_queryset(self):
        return LoyaltyCard.objects.filter(shop=get_shop(self.request.user)).select_related('customer')  # noqa: E501


class LoyaltyCardTransactionListView(APIView):
    permission_classes = (IsAuthenticated, HasLoyaltyModule)

    def get(self, request: Request, pk) -> Response:
        shop = get_shop(request.user)
        try:
            card = LoyaltyCard.objects.get(pk=pk, shop=shop)
        except LoyaltyCard.DoesNotExist:
            return Response({'detail': 'Carte introuvable.'}, status=status.HTTP_404_NOT_FOUND)  # noqa: E501
        qs = LoyaltyTransaction.objects.filter(card=card, shop=shop)
        paginator = FlexiblePageNumberPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        if page is not None:
            return paginator.get_paginated_response(LoyaltyTransactionSerializer(page, many=True).data)  # noqa: E501
        return Response(LoyaltyTransactionSerializer(qs, many=True).data)


def _get_card_or_404(shop, pk) -> tuple[LoyaltyCard | None, Response | None]:
    try:
        return LoyaltyCard.objects.get(pk=pk, shop=shop), None
    except LoyaltyCard.DoesNotExist:
        return None, Response({'detail': 'Carte introuvable.'}, status=status.HTTP_404_NOT_FOUND)  # noqa: E501


def _resolve_order(shop, customer, order_id: object | None):
    if not order_id:
        return None, None
    from apps.orders.models import Order
    try:
        order = Order.objects.get(pk=order_id, shop=shop, customer=customer)
        return order, None
    except Order.DoesNotExist:
        return None, Response(
            {'detail': "Commande introuvable ou n'appartenant pas à ce client."},
            status=status.HTTP_400_BAD_REQUEST,
        )


class LoyaltyCardEarnView(APIView):
    permission_classes = (IsAuthenticated, HasLoyaltyModule)

    def post(self, request: Request, pk) -> Response:
        shop = get_shop(request.user)
        card, err = _get_card_or_404(shop, pk)
        if err:
            return err
        serializer = EarnPointsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        order, err = _resolve_order(shop, card.customer, data.get('order_id'))
        if err:
            return err
        try:
            txn = earn_points(card, data['points'], order=order, created_by=request.user, note=data.get('note', ''))  # noqa: E501
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        card.refresh_from_db()
        return Response(
            {'transaction': LoyaltyTransactionSerializer(txn).data, 'points_balance': card.points_balance},  # noqa: E501
            status=status.HTTP_201_CREATED,
        )


class LoyaltyCardRedeemView(APIView):
    permission_classes = (IsAuthenticated, HasLoyaltyModule)

    def post(self, request: Request, pk) -> Response:
        shop = get_shop(request.user)
        card, err = _get_card_or_404(shop, pk)
        if err:
            return err
        serializer = RedeemPointsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        order, err = _resolve_order(shop, card.customer, data.get('order_id'))
        if err:
            return err
        try:
            txn = redeem_points(card, data['points'], order=order, created_by=request.user)  # noqa: E501
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        card.refresh_from_db()
        return Response(
            {'transaction': LoyaltyTransactionSerializer(txn).data, 'points_balance': card.points_balance},  # noqa: E501
            status=status.HTTP_201_CREATED,
        )


class LoyaltyCardAdjustView(APIView):
    permission_classes = (IsAuthenticated, IsShopAdmin)

    def post(self, request: Request, pk) -> Response:
        shop = get_shop(request.user)
        card, err = _get_card_or_404(shop, pk)
        if err:
            return err
        serializer = AdjustPointsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            txn = adjust_points(card, data['delta'], created_by=request.user, note=data['note'])  # noqa: E501
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        card.refresh_from_db()
        return Response(
            {'transaction': LoyaltyTransactionSerializer(txn).data, 'points_balance': card.points_balance},  # noqa: E501
            status=status.HTTP_201_CREATED,
        )
