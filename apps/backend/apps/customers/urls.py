from django.urls import path
from .views import (
    CustomerActivityView, CustomerDetailView, CustomerFacetsView,
    CustomerListCreateView,
    CustomerSummaryView,
)

urlpatterns = [
    path('', CustomerListCreateView.as_view(), name='customer-list'),
    path('summary/', CustomerSummaryView.as_view(), name='customer-summary'),
    path('facets/', CustomerFacetsView.as_view(), name='customer-facets'),
    path('<uuid:pk>/', CustomerDetailView.as_view(), name='customer-detail'),
    path('<uuid:pk>/activity/', CustomerActivityView.as_view(), name='customer-activity'),  # noqa: E501
]
