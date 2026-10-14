from django.urls import path
from .views import (
    CustomerActivityExportSummaryView, CustomerActivityExportView, CustomerActivityView,
    CustomerDetailView, CustomerFacetsView,
    CustomerListCreateView,
    CustomerSummaryView,
)

urlpatterns = [
    path('', CustomerListCreateView.as_view(), name='customer-list'),
    path('summary/', CustomerSummaryView.as_view(), name='customer-summary'),
    path('facets/', CustomerFacetsView.as_view(), name='customer-facets'),
    path('<uuid:pk>/', CustomerDetailView.as_view(), name='customer-detail'),
    path('<uuid:pk>/activity/', CustomerActivityView.as_view(), name='customer-activity'),  # noqa: E501
    path('<uuid:pk>/activity/export/', CustomerActivityExportView.as_view(), name='customer-activity-export'),  # noqa: E501
    path('<uuid:pk>/activity/export/summary/', CustomerActivityExportSummaryView.as_view(), name='customer-activity-export-summary'),  # noqa: E501
]
