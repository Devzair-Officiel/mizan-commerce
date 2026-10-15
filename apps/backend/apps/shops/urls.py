from django.urls import path

from .invoice_views import InvoiceExamplePdfView, InvoiceSettingsView

from .views import (
    AdminShopListView,
    OnboardingView,
    ShopDetailView,
    ShopLogoView,
    ShopMemberDetailView,
    ShopMemberListView,
)

urlpatterns = [
    path('', ShopDetailView.as_view(), name='shop-detail'),
    path('invoice-settings/', InvoiceSettingsView.as_view(), name='invoice-settings'),
    path(
        'invoice-settings/example/',
        InvoiceExamplePdfView.as_view(),
        name='invoice-example',
    ),
    path('logo/', ShopLogoView.as_view(), name='shop-logo'),
    path('onboarding/', OnboardingView.as_view(), name='shop-onboarding'),
    path('members/', ShopMemberListView.as_view(), name='shop-members'),
    path(
        'members/<uuid:pk>/', ShopMemberDetailView.as_view(), name='shop-member-detail'
    ),  # noqa: E501
    path('admin/all/', AdminShopListView.as_view(), name='admin-shop-list'),
]
