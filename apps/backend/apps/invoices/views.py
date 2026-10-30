from django.http import HttpResponse
from django.db.models import QuerySet
from rest_framework import filters, generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import HasModulePermission, get_shop
from apps.subscriptions.permissions import HasPlanForFeature

HasInvoicesModule = HasModulePermission.for_module('invoices')
HasInvoicesPlan = HasPlanForFeature.for_feature('invoices')
from apps.orders.models import Order  # noqa: E402

from . import listing, services  # noqa: E402
from .models import Invoice  # noqa: E402
from .filters import INVOICE_SEARCH_FIELDS, InvoiceOrderingFilter  # noqa: E402
from .serializers import (  # noqa: E402
    InvoiceIssueSerializer,
    InvoiceSerializer,
    InvoiceStatusUpdateSerializer,
)

DRAFT_STATUS_ERROR = {
    'detail': "Un brouillon n'a pas de statut de paiement : émettez la facture.",
    'code': 'draft_not_issued',
}
CREDITED_STATUS_ERRORS = {
    'invoice_credited': (
        "Cette facture a fait l'objet d'un avoir : elle ne peut plus être annulée."
    ),
    'fully_credited': (
        'Cette facture est entièrement créditée : il ne reste rien à encaisser.'
    ),
}
DRAFT_PDF_ERROR = {
    'detail': "Un brouillon n'a pas encore de PDF : émettez la facture.",
    'code': 'draft_no_pdf',
}


class InvoiceListCreateView(generics.ListCreateAPIView):
    """GET — liste les factures de la boutique. POST — émet une facture depuis une commande."""  # noqa: E501

    permission_classes = (IsAuthenticated, HasInvoicesPlan, HasInvoicesModule)
    serializer_class = InvoiceSerializer
    filter_backends = (filters.SearchFilter, InvoiceOrderingFilter)
    search_fields = INVOICE_SEARCH_FIELDS
    ordering_fields = (
        'number', 'buyer_name', 'issued_at', 'due_date', 'total_ttc', 'status',
    )
    ordering = ('-issued_at',)

    def get_queryset(self) -> QuerySet:
        shop = get_shop(self.request.user)
        qs = listing.with_relations(Invoice.objects.filter(shop=shop), shop)
        return listing.filter_invoices(qs, shop, self.request.query_params)

    def create(self, request, *args, **kwargs):
        shop = get_shop(request.user)
        payload = InvoiceIssueSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        try:
            order = Order.objects.get(pk=payload.validated_data['order_id'], shop=shop)
        except Order.DoesNotExist:
            return Response({'detail': 'Commande introuvable.'}, status=status.HTTP_404_NOT_FOUND)  # noqa: E501

        try:
            invoice = services.issue_invoice_from_order(
                shop=shop,
                order=order,
                tax_rate=payload.validated_data.get('tax_rate'),
                payment_terms_days=payload.validated_data.get('payment_terms_days'),
                notes=payload.validated_data.get('notes', ''),
                language=request.user.language,
            )
        except services.EmptyOrderError:
            return Response(
                {'detail': "Impossible d'émettre une facture pour une commande vide."},
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


class InvoiceSummaryView(APIView):
    permission_classes = (IsAuthenticated, HasInvoicesPlan, HasInvoicesModule)

    def get(self, request) -> Response:
        return Response(listing.invoice_summary(get_shop(request.user)))


class InvoiceFacetsView(APIView):
    permission_classes = (IsAuthenticated, HasInvoicesPlan, HasInvoicesModule)
    search_fields = INVOICE_SEARCH_FIELDS

    def get(self, request) -> Response:
        shop = get_shop(request.user)
        qs = filters.SearchFilter().filter_queryset(
            request, Invoice.objects.filter(shop=shop), self
        )
        return Response(listing.invoice_facets(shop, qs, request.query_params))


class InvoiceDetailView(generics.RetrieveAPIView):
    """GET — détail d'une facture (lecture seule). Pas de DELETE : exigence légale."""

    permission_classes = (IsAuthenticated, HasInvoicesPlan, HasInvoicesModule)
    serializer_class = InvoiceSerializer

    def get_queryset(self):
        shop = get_shop(self.request.user)
        return listing.with_relations(Invoice.objects.filter(shop=shop), shop)


class InvoiceStatusView(APIView):
    """PATCH — change le statut (`paid` ou `cancelled`). Pas de retour arrière vers `issued`."""  # noqa: E501

    permission_classes = (IsAuthenticated, HasInvoicesPlan, HasInvoicesModule)

    def patch(self, request, pk):
        shop = get_shop(request.user)
        try:
            invoice = Invoice.objects.get(pk=pk, shop=shop)
        except Invoice.DoesNotExist:
            return Response({'detail': 'Facture introuvable.'}, status=status.HTTP_404_NOT_FOUND)  # noqa: E501

        if invoice.status == Invoice.STATUS_CANCELLED:
            return Response(
                {'detail': 'Une facture annulée ne peut plus changer de statut.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if invoice.status == Invoice.STATUS_DRAFT:
            return Response(DRAFT_STATUS_ERROR, status=status.HTTP_409_CONFLICT)

        serializer = InvoiceStatusUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        new_status = serializer.validated_data['status']

        try:
            if new_status == Invoice.STATUS_PAID:
                services.mark_paid(invoice)
            else:
                services.cancel_invoice(invoice)
        except services.InvoiceCreditedError as exc:
            return Response(
                {'detail': CREDITED_STATUS_ERRORS[exc.code], 'code': exc.code},
                status=status.HTTP_409_CONFLICT,
            )
        except services.InvoiceStateError:
            # Le statut a changé entre la lecture et l'écriture (autre onglet).
            return Response(
                {'detail': 'Le statut de cette facture a changé : rechargez-la.'},
                status=status.HTTP_409_CONFLICT,
            )

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
            # Avoirs émis préchargés, de cette boutique seulement.
            invoice = listing.with_relations(
                Invoice.objects.select_related('shop'), shop,
            ).get(pk=pk, shop=shop)
        except Invoice.DoesNotExist:
            return Response({'detail': 'Facture introuvable.'}, status=status.HTTP_404_NOT_FOUND)  # noqa: E501
        if invoice.status == Invoice.STATUS_DRAFT:
            return Response(DRAFT_PDF_ERROR, status=status.HTTP_409_CONFLICT)

        try:
            from .pdf import build_invoice_pdf
        except ImportError:
            return Response(
                {'detail': 'Génération PDF non disponible.'},
                status=status.HTTP_501_NOT_IMPLEMENTED,
            )

        pdf_bytes = build_invoice_pdf(invoice)
        # Le numéro d'un avoir (`avoir-…`) en dit déjà la nature.
        filename = (
            f'{invoice.number}.pdf'
            if invoice.kind == Invoice.KIND_CREDIT_NOTE
            else f'facture-{invoice.number}.pdf'
        )
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="{filename}"'
        return response
