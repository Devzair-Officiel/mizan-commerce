from django.utils import timezone
from rest_framework import generics, filters, status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import SAFE_METHODS, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import IsShopAdmin, get_member, get_shop
from .models import Note, Reminder
from .serializers import (
    AssigneeSerializer, NoteSerializer, ReminderSerializer, ReminderSettingsSerializer,
)
from .services import (
    REMINDER_SCOPES, assignable_members, delete_reminder, filter_for,
    get_reminder_settings, reminders_in_scope,
)


class NoteListCreateView(generics.ListCreateAPIView):
    permission_classes = (IsAuthenticated,)
    serializer_class = NoteSerializer
    filter_backends = (filters.OrderingFilter,)
    # `-id` départage les notes de même date : fenêtres `offset` stables.
    ordering = ('-created_at', '-id')

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
        `customer` et `category` retrouvent un rappel existant (relance d'un client).
        `for` : me | team | identifiant d'un membre."""
        params = self.request.query_params
        scope = params.get('scope')
        if scope and scope not in REMINDER_SCOPES:
            raise ValidationError({'scope': 'Onglet inconnu.'})
        member = get_member(self.request.user)
        qs = reminders_in_scope(member.shop, scope)
        if customer_id := params.get('customer'):
            qs = qs.filter(customer_id=customer_id)
        if category := params.get('category'):
            qs = qs.filter(category=category)
        if for_value := params.get('for'):
            qs = filter_for(qs, for_value, member)
        return qs.select_related('author', 'customer', 'order', 'assigned_to__user')

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
        # Un rappel automatique supprimé reste en base (`dismissed`) : introuvable.
        return Reminder.objects.filter(shop=get_shop(self.request.user)).exclude(status='dismissed')  # noqa: E501

    def perform_destroy(self, instance):
        delete_reminder(instance)


class ReminderDoneView(APIView):
    """Marque un rappel comme terminé."""
    permission_classes = (IsAuthenticated,)

    def post(self, request, pk):
        shop = get_shop(request.user)
        try:
            reminder = Reminder.objects.exclude(status='dismissed').get(pk=pk, shop=shop)  # noqa: E501
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
            reminder = Reminder.objects.exclude(status='dismissed').get(pk=pk, shop=shop)  # noqa: E501
        except Reminder.DoesNotExist:
            return Response({'detail': 'Rappel introuvable.'}, status=status.HTTP_404_NOT_FOUND)  # noqa: E501
        reminder.status = 'pending'
        reminder.done_at = None
        reminder.save(update_fields=['status', 'done_at', 'updated_at'])
        return Response(ReminderSerializer(reminder, context={'shop': shop}).data)


class ReminderAssigneeListView(generics.ListAPIView):
    """Membres à qui attribuer un rappel : ceux qui ont accès aux rappels."""
    permission_classes = (IsAuthenticated,)
    serializer_class = AssigneeSerializer
    pagination_class = None

    def get_queryset(self):
        return assignable_members(get_shop(self.request.user))


class IsShopAdminOrReadOnly(IsShopAdmin):
    def has_permission(self, request, view) -> bool:
        return request.method in SAFE_METHODS or super().has_permission(request, view)


class ReminderSettingsView(generics.RetrieveUpdateAPIView):
    """Rappels automatiques : lus par tous, modifiés par le propriétaire et les
    administrateurs."""
    permission_classes = (IsAuthenticated, IsShopAdminOrReadOnly)
    serializer_class = ReminderSettingsSerializer
    http_method_names = ('get', 'patch')

    def get_object(self):
        return get_reminder_settings(get_shop(self.request.user))
