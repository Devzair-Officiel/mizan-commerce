from django.urls import path

from .views import (
    StockAdjustmentView, StockEntryView, StockExitView, StockInView,
    StockLevelFacetsView, StockLevelListView, StockLevelSummaryView,
    StockMovementListView, StockOutView,
)

urlpatterns = [
    path('movements/', StockMovementListView.as_view(), name='stock-movements'),
    path('levels/', StockLevelListView.as_view(), name='stock-levels'),
    path(
        'levels/summary/', StockLevelSummaryView.as_view(), name='stock-levels-summary',
    ),
    path('levels/facets/', StockLevelFacetsView.as_view(), name='stock-levels-facets'),
    path('entries/', StockEntryView.as_view(), name='stock-entries'),
    path('exits/', StockExitView.as_view(), name='stock-exits'),
    path('adjustments/', StockAdjustmentView.as_view(), name='stock-adjustments'),
    path('in/', StockInView.as_view(), name='stock-in'),
    path('out/', StockOutView.as_view(), name='stock-out'),
]
