from django.urls import path
from .views import ProductListCreateView, ProductDetailView, ProductDeactivateView

urlpatterns = [
    path('', ProductListCreateView.as_view(), name='product-list'),
    path('<uuid:pk>/', ProductDetailView.as_view(), name='product-detail'),
    path('<uuid:pk>/deactivate/', ProductDeactivateView.as_view(), name='product-deactivate'),
]
