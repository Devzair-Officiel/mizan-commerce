from django.utils import timezone
from rest_framework import generics, filters, status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import get_shop
from .models import Note, Reminder
from .serializers import NoteSerializer, ReminderSerializer
from .services import REMINDER_SCOPES, reminders_in_scope


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
        qs = Note.objects.filter(shop=shop).select_related('author', 'customer', 'order')  # noqa: E501
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
        """`scope` : todo | upcoming | done (sans : tous ceux en attente).
        `customer` et `category` retrouvent un rappel existant (relance d'un client)."""
        params = self.request.query_params
        scope = params.get('scope')
        if scope and scope not in REMINDER_SCOPES:
            raise ValidationError({'scope': 'Onglet inconnu.'})
        qs = reminders_in_scope(get_shop(self.request.user), scope)
        if customer_id := params.get('customer'):
            qs = qs.filter(customer_id=customer_id)
        if category := params.get('category'):
            qs = qs.filter(category=category)
        return qs.select_related('author', 'customer', 'order')

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
            return Response({'detail': 'Rappel introuvable.'}, status=status.HTTP_404_NOT_FOUND)  # noqa: E501
        reminder.status = 'done'
        reminder.done_at = timezone.now()
        reminder.save(update_fields=['status', 'done_at', 'updated_at'])
        return Response(ReminderSerializer(reminder, context={'shop': shop}).data)


class ReminderReopenView(APIView):
    """Remet un rappel en attente."""
    permission_classes = (IsAuthenticated,)

    def post(self, request, pk):
        shop = get_shop(request.user)
        try:
            reminder = Reminder.objects.get(pk=pk, shop=shop)
        except Reminder.DoesNotExist:
            return Response({'detail': 'Rappel introuvable.'}, status=status.HTTP_404_NOT_FOUND)  # noqa: E501
        reminder.status = 'pending'
        reminder.done_at = None
        reminder.save(update_fields=['status', 'done_at', 'updated_at'])
        return Response(ReminderSerializer(reminder, context={'shop': shop}).data)
