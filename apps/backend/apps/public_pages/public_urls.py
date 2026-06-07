from django.urls import path

from .public_views import PublicShopView

urlpatterns = [
    path('<slug:slug>/', PublicShopView.as_view(), name='public-shop'),
]
