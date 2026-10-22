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
from apps.products.models import ProductVariant
from apps.stock.filters import LevelOrderingFilter
from apps.stock.services import LEVEL_SEARCH_FIELDS
from apps.subscriptions.permissions import HasPlanForFeature

from . import services, stock_dataset
from .render_csv import render_csv
from .render_pdf import render_pdf
from .render_whatsapp import render_whatsapp
from .serializers import OrdersExportQuerySerializer, StockExportQuerySerializer
from .services import ExportDataset, OrderFilters
from .stock_dataset import StockFilters
from .throttles import ExportRenderRateThrottle

HasOrdersModule = HasModulePermission.for_module('orders')
HasStockModule = HasModulePermission.for_module('stock')
HasExportsPlan = HasPlanForFeature.for_feature('exports')
# Rendus générés par le serveur, limités par utilisateur ; le CSV part en flux.
RATE_LIMITED = ('pdf', 'whatsapp')


def _too_many_rows(detail: str) -> Response:
    return Response({
        'detail': detail, 'code': 'pdf_row_limit', 'max_rows': services.PDF_MAX_ROWS,
    }, status=status.HTTP_400_BAD_REQUEST)


def _rendered(dataset: ExportDataset, output: str) -> HttpResponse | Response:
    """CSV en flux, PDF en pièce jointe, ou texte WhatsApp (sans fichier)."""
    if output == 'whatsapp':
        return Response({'text': render_whatsapp(dataset), 'rows': dataset.row_count})
    if output == 'csv':
        response = StreamingHttpResponse(render_csv(dataset), content_type='text/csv; charset=utf-8')  # noqa: E501
    else:
        response = HttpResponse(render_pdf(dataset), content_type='application/pdf')
    filename = f'{dataset.filename_stem}-{dataset.filename_date}.{output}'
    response['Content-Disposition'] = content_disposition_header(True, filename)
    return response


class _RateLimitedRenders:
    """PDF et message : limités par utilisateur, en plus du débit général."""

    def get_throttles(self) -> list:
        throttles = super().get_throttles()
        if self.kwargs.get('output') in RATE_LIMITED:
            throttles.append(ExportRenderRateThrottle())
        return throttles


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
            'whatsapp_max_rows': services.WHATSAPP_MAX_ROWS,
        })


class OrdersExportView(_RateLimitedRenders, _OrdersExportBase):
    """Export des commandes en CSV (flux), PDF ou texte WhatsApp ; journal d'audit."""

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
            detail = 'Trop de commandes pour un PDF : exportez-les en CSV.'
            return _too_many_rows(detail)
        response = _rendered(dataset, output)
        services.log_orders_export(
            dataset, user=request.user, export_format=output, filters=order_filters,
        )
        return response


class _StockExportBase(GenericAPIView):
    """Formats suivis de la boutique, recherche et tri de la page Stock."""

    permission_classes = (IsAuthenticated, HasExportsPlan, HasStockModule)
    filter_backends = (filters.SearchFilter, LevelOrderingFilter)
    search_fields = LEVEL_SEARCH_FIELDS

    def export_params(self) -> tuple[StockFilters, str | None]:
        """Périmètre et recherche validés (400 sinon), puis la langue."""
        query = StockExportQuerySerializer(data=self.request.query_params)
        query.is_valid(raise_exception=True)
        data = dict(query.validated_data)
        data.pop('ordering', None)
        lang = data.pop('lang', None)
        return StockFilters(**data), lang

    def export_queryset(self, stock_filters: StockFilters) -> QuerySet[ProductVariant]:
        shop = get_shop(self.request.user)
        qs = stock_dataset.export_stock_queryset(shop, stock_filters)
        return self.filter_queryset(qs)


class StockExportSummaryView(_StockExportBase):
    """Nombre de formats de l'export, avant le téléchargement, et plafonds."""

    def get(self, request: Request) -> Response:
        stock_filters, _ = self.export_params()
        return Response({
            'rows': self.export_queryset(stock_filters).count(),
            'pdf_max_rows': services.PDF_MAX_ROWS,
            'whatsapp_max_rows': services.WHATSAPP_MAX_ROWS,
        })


class StockExportView(_RateLimitedRenders, _StockExportBase):
    """Export du stock en CSV (flux), PDF ou texte WhatsApp (toujours la liste à
    réapprovisionner, ruptures d'abord) ; journal d'audit."""

    def get(self, request: Request, output: str) -> HttpResponse | Response:
        stock_filters, lang = self.export_params()
        if output == 'whatsapp':
            stock_filters = stock_dataset.whatsapp_filters(stock_filters)
        qs = self.export_queryset(stock_filters)
        if output == 'whatsapp':
            # Ruptures d'abord, quel que soit le tri de la page.
            qs = qs.order_by(*stock_dataset.RESTOCK_ORDER)
        dataset = stock_dataset.stock_dataset(
            get_shop(request.user), qs, stock_filters,
            services.export_language(lang, request.user, output),
        )
        try:
            services.check_row_limit(dataset, output)
        except services.TooManyRows:
            detail = 'Trop de formats pour un PDF : exportez-les en CSV.'
            return _too_many_rows(detail)
        response = _rendered(dataset, output)
        stock_dataset.log_stock_export(
            dataset, user=request.user, export_format=output, filters=stock_filters,
        )
        return response
