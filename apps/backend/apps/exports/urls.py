from django.urls import path, re_path

from .views import (
    OrdersExportSummaryView, OrdersExportView, StatementExportSummaryView,
    StatementExportView, StockExportSummaryView, StockExportView,
)

urlpatterns = [
    path('orders/summary/', OrdersExportSummaryView.as_view(), name='exports-orders-summary'),  # noqa: E501
    # Format dans le chemin : `?format=` est réservé à la négociation de DRF.
    re_path(r'^orders/(?P<output>csv|pdf|whatsapp)/$', OrdersExportView.as_view(), name='exports-orders'),  # noqa: E501
    path('stock/summary/', StockExportSummaryView.as_view(), name='exports-stock-summary'),  # noqa: E501
    re_path(r'^stock/(?P<output>csv|pdf|whatsapp)/$', StockExportView.as_view(), name='exports-stock'),  # noqa: E501
    # Relevé de compte d'un client : PDF et message ; le CSV reste celui de l'activité.
    path('customers/<uuid:pk>/statement/summary/', StatementExportSummaryView.as_view(), name='exports-statement-summary'),  # noqa: E501
    re_path(r'^customers/(?P<pk>[0-9a-f-]{36})/statement/(?P<output>pdf|whatsapp)/$', StatementExportView.as_view(), name='exports-statement'),  # noqa: E501
]
