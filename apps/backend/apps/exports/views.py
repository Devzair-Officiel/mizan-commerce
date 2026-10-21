from django.db.models import QuerySet
from django.http import HttpResponse, StreamingHttpResponse
from django.utils.http import content_disposition_header
from rest_framework import filters, status
from rest_framework.generics import GenericAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from apps.core.permissions import HasModulePermission, get_shop
from apps.orders.filters import ORDER_SEARCH_FIELDS, OrderOrderingFilter
from apps.orders.models import Order
from apps.subscriptions.permissions import HasPlanForFeature

from . import services
from .render_csv import render_csv
from .render_pdf import render_pdf
from .render_whatsapp import render_whatsapp
from .serializers import OrdersExportQuerySerializer
from .services import OrderFilters
from .throttles import ExportRenderRateThrottle

HasOrdersModule = HasModulePermission.for_module('orders')
HasExportsPlan = HasPlanForFeature.for_feature('exports')
# Rendus générés par le serveur, limités par utilisateur ; le CSV part en flux.
RATE_LIMITED = ('pdf', 'whatsapp')


class _OrdersExportBase(GenericAPIView):
    """Commandes de la boutique avec les filtres, la recherche et le tri de la liste."""

    permission_classes = (IsAuthenticated, HasExportsPlan, HasOrdersModule)
    filter_backends = (filters.SearchFilter, OrderOrderingFilter)
    search_fields = ORDER_SEARCH_FIELDS
    ordering_fields = (
        'order_number', 'customer__name', 'created_at', 'total_amount',
        'status', 'payment_status',
    )
    ordering = ('-created_at',)

    def export_params(self) -> tuple[OrderFilters, dict]:
        """Filtres validés (400 sinon) et paramètres restants (langue)."""
        shop = get_shop(self.request.user)
        query = OrdersExportQuerySerializer(
            data=self.request.query_params, context={'shop': shop},
        )
        query.is_valid(raise_exception=True)
        data = dict(query.validated_data)
        lang = data.pop('lang', None)
        return OrderFilters(**data), {'lang': lang}

    def export_queryset(self, order_filters: OrderFilters) -> QuerySet[Order]:
        shop = get_shop(self.request.user)
        qs = services.export_orders_queryset(shop, order_filters)
        return self.filter_queryset(qs)


class OrdersExportSummaryView(_OrdersExportBase):
    """Nombre de lignes de l'export, avant le téléchargement, et plafond du PDF."""

    def get(self, request: Request) -> Response:
        order_filters, _ = self.export_params()
        return Response({
            'rows': self.export_queryset(order_filters).count(),
            'pdf_max_rows': services.PDF_MAX_ROWS,
        })


class OrdersExportView(_OrdersExportBase):
    """Export des commandes en CSV (flux), PDF ou texte WhatsApp ; journal d'audit."""

    def get_throttles(self) -> list:
        throttles = super().get_throttles()
        if self.kwargs.get('output') in RATE_LIMITED:
            throttles.append(ExportRenderRateThrottle())
        return throttles

    def get(self, request: Request, output: str) -> HttpResponse | Response:
        order_filters, extra = self.export_params()
        shop = get_shop(request.user)
        lang = services.export_language(extra['lang'], request.user, output)
        dataset = services.orders_dataset(
            shop, self.export_queryset(order_filters), order_filters, lang,
        )
        try:
            services.check_row_limit(dataset, output)
        except services.TooManyRows:
            return Response({
                'detail': 'Trop de commandes pour un PDF : exportez-les en CSV.',
                'code': 'pdf_row_limit',
                'max_rows': services.PDF_MAX_ROWS,
            }, status=status.HTTP_400_BAD_REQUEST)
        filename = f'{dataset.filename_stem}-{dataset.filename_date}.{output}'
        if output == 'csv':
            response = StreamingHttpResponse(render_csv(dataset), content_type='text/csv; charset=utf-8')  # noqa: E501
        elif output == 'pdf':
            response = HttpResponse(render_pdf(dataset), content_type='application/pdf')
        else:
            response = Response({'text': render_whatsapp(dataset), 'rows': dataset.row_count})  # noqa: E501
        services.log_orders_export(
            dataset, user=request.user, export_format=output, filters=order_filters,
        )
        if output != 'whatsapp':
            response['Content-Disposition'] = content_disposition_header(True, filename)
        return response
