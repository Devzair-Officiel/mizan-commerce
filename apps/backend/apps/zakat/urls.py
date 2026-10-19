from django.urls import path
from .views import (
    ZakatProfileView,
    ZakatSourcesView,
    ZakatCalculationListCreateView,
    ZakatCalculationDetailView,
    ZakatCalculationPdfView,
    ZakatPaymentView,
    ZakatFollowUpListView,
    ZakatCalculationFollowUpsView,
    ZakatFollowUpActionView,
)

urlpatterns = [
    path('zakat/profile/', ZakatProfileView.as_view(), name='zakat-profile'),
    path('zakat/sources/', ZakatSourcesView.as_view(), name='zakat-sources'),
    path('zakat/calculations/', ZakatCalculationListCreateView.as_view(), name='zakat-calculation-list'),  # noqa: E501
    path('zakat/calculations/<uuid:pk>/', ZakatCalculationDetailView.as_view(), name='zakat-calculation-detail'),  # noqa: E501
    path('zakat/calculations/<uuid:pk>/pdf/', ZakatCalculationPdfView.as_view(), name='zakat-calculation-pdf'),  # noqa: E501
    path('zakat/calculations/<uuid:pk>/payment/', ZakatPaymentView.as_view(), name='zakat-calculation-payment'),  # noqa: E501
    path('zakat/calculations/<uuid:pk>/followups/', ZakatCalculationFollowUpsView.as_view(), name='zakat-calculation-followups'),  # noqa: E501
    path('zakat/calculations/<uuid:pk>/followups/<uuid:line_id>/', ZakatFollowUpActionView.as_view(), name='zakat-followup-action'),  # noqa: E501
    path('zakat/followups/', ZakatFollowUpListView.as_view(), name='zakat-followups'),
]
