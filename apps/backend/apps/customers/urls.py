from django.urls import path
from .views import CustomerActivityView, CustomerListCreateView, CustomerDetailView

urlpatterns = [
    path('', CustomerListCreateView.as_view(), name='customer-list'),
    path('<uuid:pk>/', CustomerDetailView.as_view(), name='customer-detail'),
    path('<uuid:pk>/activity/', CustomerActivityView.as_view(), name='customer-activity'),
]
