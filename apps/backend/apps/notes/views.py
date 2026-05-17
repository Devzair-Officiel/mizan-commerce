from django.utils import timezone
from rest_framework import generics, filters, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.shops.models import ShopMember
from .models import Note, Reminder
from .serializers import NoteSerializer, ReminderSerializer


def get_shop(user):
    membership = ShopMember.objects.filter(user=user).select_related('shop').first()
    if not membership:
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied('Aucune boutique associée.')
    return membership.shop


class NoteListCreateView(generics.ListCreateAPIView):
    permission_classes = (IsAuthenticated,)
    serializer_class = NoteSerializer
    filter_backends = (filters.OrderingFilter,)
    ordering = ('-created_at',)

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['shop'] = get_shop(self.request.user)
        return ctx

    def get_queryset(self):
        shop = get_shop(self.request.user)
        qs = Note.objects.filter(shop=shop).select_related('author', 'customer', 'order')
        if customer_id := self.request.query_params.get('customer'):
            qs = qs.filter(customer_id=customer_id)
        if order_id := self.request.query_params.get('order'):
            qs = qs.filter(order_id=order_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(shop=get_shop(self.request.user), author=self.request.user)


class NoteDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = (IsAuthenticated,)
    serializer_class = NoteSerializer

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['shop'] = get_shop(self.request.user)
        return ctx

    def get_queryset(self):
        return Note.objects.filter(shop=get_shop(self.request.user))


class ReminderListCreateView(generics.ListCreateAPIView):
    permission_classes = (IsAuthenticated,)
    serializer_class = ReminderSerializer
    filter_backends = (filters.OrderingFilter,)
    ordering = ('due_at',)

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['shop'] = get_shop(self.request.user)
        return ctx

    def get_queryset(self):
        shop = get_shop(self.request.user)
        qs = Reminder.objects.filter(shop=shop).select_related('author', 'customer', 'order')
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        else:
            qs = qs.filter(status='pending')
        return qs

    def perform_create(self, serializer):
        serializer.save(shop=get_shop(self.request.user), author=self.request.user)


class ReminderDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = (IsAuthenticated,)
    serializer_class = ReminderSerializer

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['shop'] = get_shop(self.request.user)
        return ctx

    def get_queryset(self):
        return Reminder.objects.filter(shop=get_shop(self.request.user))


class ReminderDoneView(APIView):
    """Marque un rappel comme terminé."""
    permission_classes = (IsAuthenticated,)

    def post(self, request, pk):
        shop = get_shop(request.user)
        try:
            reminder = Reminder.objects.get(pk=pk, shop=shop)
        except Reminder.DoesNotExist:
            return Response({'detail': 'Rappel introuvable.'}, status=status.HTTP_404_NOT_FOUND)
        reminder.status = 'done'
        reminder.done_at = timezone.now()
        reminder.save(update_fields=['status', 'done_at', 'updated_at'])
        return Response(ReminderSerializer(reminder, context={'shop': shop}).data)
