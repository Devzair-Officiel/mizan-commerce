from django.db.models import QuerySet
from rest_framework import filters, generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import HasModulePermission, get_shop

HasStockModule = HasModulePermission.for_module('stock')
from apps.ocr.services import (  # noqa: E402
    InvoiceAlreadyRecordedError, InvoiceEntryLine, OcrResultNotReviewableError,
    record_invoice_entry,
)
from . import services  # noqa: E402
from .filters import LevelOrderingFilter  # noqa: E402
from .serializers import (  # noqa: E402
    StockAdjustmentSerializer, StockEntrySerializer, StockExitSerializer,
    StockInSerializer, StockLevelSerializer, StockMovementSerializer,
    StockOutSerializer,
)
from .services import (  # noqa: E402
    CountLine, EntryLine, EntryReference, ExitLine, LEVEL_SEARCH_FIELDS,
    MOVEMENT_SEARCH_FIELDS, adjust_to_counts, create_entry, create_exit,
    load_stock_variants,
)


class StockMovementListView(generics.ListAPIView):
    """Historique des mouvements : type, période, article, format, recherche."""
    serializer_class = StockMovementSerializer
    permission_classes = (IsAuthenticated, HasStockModule)
    filter_backends = (filters.SearchFilter, filters.OrderingFilter)
    search_fields = MOVEMENT_SEARCH_FIELDS
    ordering_fields = ('created_at',)
    ordering = ('-created_at',)

    def get_queryset(self) -> QuerySet:
        shop = get_shop(self.request.user)
        qs = services.movements_with_references(shop)
        return services.filter_movements(qs, self.request.query_params, shop.timezone)

    def filter_queryset(self, queryset: QuerySet) -> QuerySet:
        # Départage stable des mouvements créés dans la même transaction.
        qs = super().filter_queryset(queryset)
        return qs.order_by(*qs.query.order_by, 'id')


class StockLevelListView(generics.ListAPIView):
    """Niveaux de stock : une ligne par format suivi (articles actifs)."""
    serializer_class = StockLevelSerializer
    permission_classes = (IsAuthenticated, HasStockModule)
    filter_backends = (filters.SearchFilter, LevelOrderingFilter)
    search_fields = LEVEL_SEARCH_FIELDS

    def get_queryset(self) -> QuerySet:
        qs = services.stock_levels(get_shop(self.request.user))
        return services.filter_levels(qs, self.request.query_params)


class StockLevelSummaryView(APIView):
    """Indicateurs du stock (négatif, rupture, faible, valeur d'achat)."""
    permission_classes = (IsAuthenticated, HasStockModule)

    def get(self, request: Request) -> Response:
        return Response(services.build_levels_summary(get_shop(request.user)))


class StockLevelFacetsView(APIView):
    """Nombre de formats par état, avec les mêmes paramètres que la liste."""
    permission_classes = (IsAuthenticated, HasStockModule)
    search_fields = LEVEL_SEARCH_FIELDS

    def get(self, request: Request) -> Response:
        qs = services.stock_levels(get_shop(request.user))
        qs = filters.SearchFilter().filter_queryset(request, qs, self)
        return Response(services.build_level_facets(qs, request.query_params))


def _created(movements: list) -> Response:
    data = StockMovementSerializer(movements, many=True).data
    return Response({'movements': data}, status=status.HTTP_201_CREATED)


class StockEntryView(APIView):
    """Entrée de stock en plusieurs lignes, depuis une saisie ou une facture lue."""
    permission_classes = (IsAuthenticated, HasStockModule)

    def post(self, request: Request) -> Response:
        shop = get_shop(request.user)
        serializer = StockEntrySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        variants = load_stock_variants(shop, [line['variant'] for line in d['lines']])
        lines = [
            EntryLine(variant, line['quantity'], line['unit_purchase_price'])
            for variant, line in zip(variants, d['lines'], strict=True)
        ]
        reference = EntryReference(
            d['supplier_name'], d['invoice_number'], d['invoice_date'],
        )
        if d['ocr_document'] is None:
            return _created(create_entry(shop, request.user, lines, reference))
        try:
            movements = record_invoice_entry(
                shop=shop, user=request.user, document_id=d['ocr_document'],
                reference=reference,
                ignored_line_indices=d['ignored_line_indices'],
                lines=[
                    InvoiceEntryLine(line, raw['invoice_line_index'])
                    for line, raw in zip(lines, d['lines'], strict=True)
                ],
            )
        except (InvoiceAlreadyRecordedError, OcrResultNotReviewableError) as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_409_CONFLICT)
        return _created(movements)


class StockExitView(APIView):
    """Sortie manuelle en plusieurs lignes (perte, casse, usage interne)."""
    permission_classes = (IsAuthenticated, HasStockModule)

    def post(self, request: Request) -> Response:
        shop = get_shop(request.user)
        serializer = StockExitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        variants = load_stock_variants(shop, [line['variant'] for line in d['lines']])
        lines = [
            ExitLine(variant, line['quantity'])
            for variant, line in zip(variants, d['lines'], strict=True)
        ]
        return _created(create_exit(shop, request.user, lines, d['reason'], d['note']))


class StockAdjustmentView(APIView):
    """Correction d'inventaire en plusieurs lignes, tout ou rien : un mouvement
    égal à l'écart par ligne (aucun si l'écart est nul)."""
    permission_classes = (IsAuthenticated, HasStockModule)

    def post(self, request: Request) -> Response:
        shop = get_shop(request.user)
        serializer = StockAdjustmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        variants = load_stock_variants(shop, [line['variant'] for line in d['lines']])
        lines = [
            CountLine(variant, line['counted_quantity'])
            for variant, line in zip(variants, d['lines'], strict=True)
        ]
        movements = adjust_to_counts(shop, request.user, lines, d['note'])
        if not movements:
            return Response({'movements': []}, status=status.HTTP_200_OK)
        return _created(movements)


class StockInView(APIView):
    """Entrée stock (réassort) sur une variante."""
    permission_classes = (IsAuthenticated, HasStockModule)

    def post(self, request: Request) -> Response:
        shop = get_shop(request.user)
        serializer = StockInSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        [variant] = load_stock_variants(shop, [d['variant']])
        movement = services.create_movement(
            shop, variant, 'in', d['quantity'], reason=d['reason'],
            created_by=request.user,
        )
        return Response(
            StockMovementSerializer(movement).data, status=status.HTTP_201_CREATED,
        )


class StockOutView(APIView):
    """Sortie stock sur une variante (perte, casse, usage interne), limitée au stock."""
    permission_classes = (IsAuthenticated, HasStockModule)

    def post(self, request: Request) -> Response:
        shop = get_shop(request.user)
        serializer = StockOutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        [variant] = load_stock_variants(shop, [d['variant']])
        [movement] = create_exit(
            shop, request.user, [ExitLine(variant, d['quantity'])],
            d['movement_type'], d['reason'],
        )
        return Response(
            StockMovementSerializer(movement).data, status=status.HTTP_201_CREATED,
        )
