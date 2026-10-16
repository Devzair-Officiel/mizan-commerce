from __future__ import annotations

from django.utils import timezone
from rest_framework import filters, generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import HasModulePermission, IsShopAdmin, get_shop
from apps.customers.models import Customer
from apps.orders.models import Order
from apps.subscriptions.permissions import HasPlanForFeature

HasMessagesModule = HasModulePermission.for_module('messages')
# Le module « messages » est aujourd'hui équivalent au canal WhatsApp ; on
# réutilise donc directement la feature commerciale `whatsapp`.
HasWhatsappPlan = HasPlanForFeature.for_feature('whatsapp')

from .models import PreparedMessage  # noqa: E402
from .serializers import (  # noqa: E402
    MessageComposeSerializer,
    MessagePreviewSerializer,
    MessageSettingsUpdateSerializer,
    PreparedMessageCreateSerializer,
    PreparedMessageSerializer,
    PreparedMessageUpdateSerializer,
)
from .services import (  # noqa: E402
    VARIABLES,
    compose,
    default_texts,
    get_message_settings,
    prepare_message,
    preview,
    resolve_language,
    update_message_settings,
)


class PreparedMessageListCreateView(generics.ListCreateAPIView):
    """GET/POST /api/messages/prepared/."""

    permission_classes = (IsAuthenticated, HasWhatsappPlan, HasMessagesModule)
    serializer_class = PreparedMessageSerializer
    filter_backends = (filters.OrderingFilter,)
    # `-id` départage les messages de même date : fenêtres `offset` stables.
    ordering = ('-created_at', '-id')

    def get_queryset(self):
        shop = get_shop(self.request.user)
        qs = (
            PreparedMessage.objects
            .filter(shop=shop)
            .select_related('customer')
        )
        params = self.request.query_params
        if status_filter := params.get('status'):
            qs = qs.filter(status=status_filter)
        if customer_id := params.get('customer'):
            qs = qs.filter(customer_id=customer_id)
        if order_id := params.get('order'):
            qs = qs.filter(context_type=PreparedMessage.ContextType.ORDER, context_id=order_id)  # noqa: E501
        if template := params.get('template_type'):
            qs = qs.filter(template_type=template)
        return qs

    def create(self, request, *args, **kwargs):
        shop = get_shop(request.user)
        serializer = PreparedMessageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        customer = None
        if customer_id := data.get('customer_id'):
            customer = Customer.objects.filter(shop=shop, id=customer_id).first()
            if customer is None:
                return Response(
                    {'detail': 'Client introuvable.'},
                    status=status.HTTP_404_NOT_FOUND,
                )

        try:
            prepared = prepare_message(
                shop=shop,
                user=request.user,
                template_type=data['template_type'],
                context_type=data.get('context_type', PreparedMessage.ContextType.NONE),
                context_id=data.get('context_id'),
                customer=customer,
                custom_message=data.get('custom_message'),
                sent=data['sent'],
            )
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            PreparedMessageSerializer(prepared).data,
            status=status.HTTP_201_CREATED,
        )


class PreparedMessageDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PATCH/DELETE /api/messages/prepared/<id>/.

    PATCH ne permet que d'éditer le texte (`message`). Le statut passe par
    les endpoints dédiés.
    """

    permission_classes = (IsAuthenticated, HasWhatsappPlan, HasMessagesModule)
    http_method_names = ('get', 'patch', 'delete', 'head', 'options')

    def get_queryset(self):
        return PreparedMessage.objects.filter(shop=get_shop(self.request.user))

    def get_serializer_class(self):
        if self.request.method == 'PATCH':
            return PreparedMessageUpdateSerializer
        return PreparedMessageSerializer

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.status != PreparedMessage.Status.PREPARED:
            return Response(
                {'detail': 'Seul un message en statut « préparé » peut être édité.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(PreparedMessageSerializer(instance).data)


class PreparedMessageMarkSentView(APIView):
    """POST /api/messages/prepared/<id>/mark-sent/ — marque le message comme envoyé manuellement."""  # noqa: E501

    permission_classes = (IsAuthenticated, HasWhatsappPlan, HasMessagesModule)

    def post(self, request, pk):
        shop = get_shop(request.user)
        try:
            prepared = PreparedMessage.objects.get(pk=pk, shop=shop)
        except PreparedMessage.DoesNotExist:
            return Response(
                {'detail': 'Message introuvable.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        if prepared.status == PreparedMessage.Status.ARCHIVED:
            return Response(
                {'detail': 'Un message archivé ne peut pas être marqué comme envoyé.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        prepared.status = PreparedMessage.Status.SENT_MANUALLY
        prepared.sent_manually_at = timezone.now()
        prepared.save(update_fields=['status', 'sent_manually_at', 'updated_at'])
        return Response(PreparedMessageSerializer(prepared).data)


class MessageSettingsView(APIView):
    """GET/PATCH /api/messages/settings/ — ton et modèles de la boutique (URS-066).

    GET renvoie aussi les textes par défaut des deux tons dans la langue demandée
    (`?lang=`, sinon celle de l'utilisateur), pour l'éditeur et « Rétablir ».
    """

    permission_classes = (IsAuthenticated, HasWhatsappPlan, IsShopAdmin)

    def _payload(self, request, settings) -> dict:
        lang = resolve_language(request.query_params.get('lang'), request.user)
        return {
            'tone': settings.tone,
            'texts': settings.custom_texts or {},
            'defaults': default_texts(settings.shop, lang),
            'variables': list(VARIABLES),
        }

    def get(self, request):
        return Response(self._payload(request, get_message_settings(get_shop(request.user))))  # noqa: E501

    def patch(self, request):
        serializer = MessageSettingsUpdateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.to_validation_error(), status=status.HTTP_400_BAD_REQUEST)  # noqa: E501
        data = serializer.validated_data
        settings = update_message_settings(
            get_message_settings(get_shop(request.user)),
            tone=data.get('tone'), texts=data.get('texts'),
        )
        return Response(self._payload(request, settings))


class MessagePreviewView(APIView):
    """POST /api/messages/preview/ — rendu d'un texte sur la dernière commande, ou un exemple."""  # noqa: E501

    permission_classes = (IsAuthenticated, HasWhatsappPlan, IsShopAdmin)

    def post(self, request):
        serializer = MessagePreviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        return Response(preview(
            shop=get_shop(request.user),
            text=data['text'],
            lang=resolve_language(data.get('lang'), request.user),
            tone=data.get('tone'),
        ))


class MessageComposeView(APIView):
    """POST /api/messages/compose/ — texte prêt à envoyer (commande ou client).

    Rien n'est enregistré ni envoyé : le commerçant relit, puis ouvre WhatsApp.
    Relève de l'offre WhatsApp (Solo et au-delà), comme l'enregistrement de l'envoi.
    """

    permission_classes = (IsAuthenticated, HasWhatsappPlan, HasMessagesModule)

    def post(self, request):
        serializer = MessageComposeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        shop = get_shop(request.user)
        order = customer = None
        if data.get('order_id'):
            order = Order.objects.filter(shop=shop, id=data['order_id']).select_related('customer').first()  # noqa: E501
            if order is None:
                return Response({'detail': 'Commande introuvable.'}, status=status.HTTP_404_NOT_FOUND)  # noqa: E501
        if data.get('customer_id'):
            customer = Customer.objects.filter(shop=shop, id=data['customer_id']).first()  # noqa: E501
            if customer is None:
                return Response({'detail': 'Client introuvable.'}, status=status.HTTP_404_NOT_FOUND)  # noqa: E501
        template_type, message = compose(
            shop=shop,
            lang=resolve_language(data.get('lang'), request.user),
            template=data.get('template'),
            order=order,
            customer=customer,
        )
        return Response({'template_type': template_type, 'message': message})
