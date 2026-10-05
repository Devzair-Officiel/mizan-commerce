from django.urls import path
from .views import (
    ProductListCreateView, ProductDetailView, ProductDeactivateView, ProductReactivateView,  # noqa: E501
    ProductImageUploadView, ProductImageSignedUrlView, ProductSummaryView,
    ProductVariantListCreateView, ProductVariantDetailView,
)

urlpatterns = [
    path('', ProductListCreateView.as_view(), name='product-list'),
    path('summary/', ProductSummaryView.as_view(), name='product-summary'),
    path('<uuid:pk>/', ProductDetailView.as_view(), name='product-detail'),
    path('<uuid:pk>/deactivate/', ProductDeactivateView.as_view(), name='product-deactivate'),  # noqa: E501
    path('<uuid:pk>/reactivate/', ProductReactivateView.as_view(), name='product-reactivate'),  # noqa: E501
    path('<uuid:pk>/images/', ProductImageUploadView.as_view(), name='product-image-upload'),  # noqa: E501
    path('<uuid:pk>/images/<uuid:image_pk>/url/', ProductImageSignedUrlView.as_view(), name='product-image-url'),  # noqa: E501
    path('<uuid:pk>/variants/', ProductVariantListCreateView.as_view(), name='product-variant-list'),  # noqa: E501
    path('<uuid:pk>/variants/<uuid:variant_pk>/', ProductVariantDetailView.as_view(), name='product-variant-detail'),  # noqa: E501
]
