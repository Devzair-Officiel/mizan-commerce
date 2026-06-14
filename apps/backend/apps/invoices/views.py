from django.http import HttpResponse
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import HasModulePermission, get_shop
from apps.subscriptions.permissions import HasPlanForFeature

HasInvoicesModule = HasModulePermission.for_module('invoices')
HasInvoicesPlan = HasPlanForFeature.for_feature('invoices')
from apps.orders.models import Order

from . import services
from .models import Invoice
from .serializers import (
    InvoiceIssueSerializer,
    InvoiceSerializer,
    InvoiceStatusUpdateSerializer,
)


class InvoiceListCreateView(generics.ListCreateAPIView):
    """GET — liste les factures de la boutique. POST — émet une facture depuis une commande."""

    permission_classes = (IsAuthenticated, HasInvoicesPlan, HasInvoicesModule)
    serializer_class = InvoiceSerializer

    def get_queryset(self):
        qs = Invoice.objects.filter(shop=get_shop(self.request.user)).prefetch_related('lines')
        status_filter = self.request.query_params.get('status')
        if status_filter in (Invoice.STATUS_ISSUED, Invoice.STATUS_PAID, Invoice.STATUS_CANCELLED):
            qs = qs.filter(status=status_filter)
        return qs

    def create(self, request, *args, **kwargs):
        shop = get_shop(request.user)
        payload = InvoiceIssueSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        try:
            order = Order.objects.get(pk=payload.validated_data['order_id'], shop=shop)
        except Order.DoesNotExist:
            return Response({'detail': 'Commande introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            invoice = services.issue_invoice_from_order(
                shop=shop,
                order=order,
                tax_rate=payload.validated_data.get('tax_rate'),
                payment_terms_days=payload.validated_data.get('payment_terms_days'),
                notes=payload.validated_data.get('notes', ''),
            )
        except services.EmptyOrderError:
            return Response(
                {'detail': 'Impossible d\'émettre une facture pour une commande vide.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except services.InvoiceAlreadyExistsError as exc:
            return Response(
                {
                    'detail': 'Une facture existe déjà pour cette commande.',
                    'existing_id': str(exc.invoice_id),
                },
                status=status.HTTP_409_CONFLICT,
            )

        return Response(
            InvoiceSerializer(invoice).data,
            status=status.HTTP_201_CREATED,
        )


class InvoiceDetailView(generics.RetrieveAPIView):
    """GET — détail d'une facture (lecture seule). Pas de DELETE : exigence légale."""

    permission_classes = (IsAuthenticated, HasInvoicesPlan, HasInvoicesModule)
    serializer_class = InvoiceSerializer

    def get_queryset(self):
        return Invoice.objects.filter(shop=get_shop(self.request.user)).prefetch_related('lines')


class InvoiceStatusView(APIView):
    """PATCH — change le statut (`paid` ou `cancelled`). Pas de retour arrière vers `issued`."""

    permission_classes = (IsAuthenticated, HasInvoicesPlan, HasInvoicesModule)

    def patch(self, request, pk):
        shop = get_shop(request.user)
        try:
            invoice = Invoice.objects.get(pk=pk, shop=shop)
        except Invoice.DoesNotExist:
            return Response({'detail': 'Facture introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        if invoice.status == Invoice.STATUS_CANCELLED:
            return Response(
                {'detail': 'Une facture annulée ne peut plus changer de statut.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = InvoiceStatusUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        new_status = serializer.validated_data['status']

        if new_status == Invoice.STATUS_PAID:
            services.mark_paid(invoice)
        else:
            services.cancel_invoice(invoice)

        return Response(InvoiceSerializer(invoice).data)


class InvoicePdfView(APIView):
    """GET — renvoie le PDF de la facture.

    Implémentation effective déléguée à Chunk 4 (ReportLab). Ici, on retourne 501 pour
    réserver l'URL et permettre au frontend de la câbler dès maintenant.
    """

    permission_classes = (IsAuthenticated, HasInvoicesPlan, HasInvoicesModule)

    def get(self, request, pk):
        shop = get_shop(request.user)
        try:
            invoice = Invoice.objects.select_related('shop').prefetch_related('lines').get(
                pk=pk, shop=shop,
            )
        except Invoice.DoesNotExist:
            return Response({'detail': 'Facture introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            from .pdf import build_invoice_pdf
        except ImportError:
            return Response(
                {'detail': 'Génération PDF non disponible.'},
                status=status.HTTP_501_NOT_IMPLEMENTED,
            )

        pdf_bytes = build_invoice_pdf(invoice)
        filename = f'facture-{invoice.number}.pdf'
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="{filename}"'
        return response
