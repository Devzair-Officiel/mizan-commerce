from django.urls import path, re_path

from .views import (
    OrdersExportSummaryView, OrdersExportView, StockExportSummaryView, StockExportView,
)

urlpatterns = [
    path('orders/summary/', OrdersExportSummaryView.as_view(), name='exports-orders-summary'),  # noqa: E501
    # Format dans le chemin : `?format=` est réservé à la négociation de DRF.
    re_path(r'^orders/(?P<output>csv|pdf|whatsapp)/$', OrdersExportView.as_view(), name='exports-orders'),  # noqa: E501
    path('stock/summary/', StockExportSummaryView.as_view(), name='exports-stock-summary'),  # noqa: E501
    re_path(r'^stock/(?P<output>csv|pdf|whatsapp)/$', StockExportView.as_view(), name='exports-stock'),  # noqa: E501
]
