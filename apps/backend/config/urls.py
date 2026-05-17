from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('apps.accounts.urls')),
    path('api/shop/', include('apps.shops.urls')),
    path('api/products/', include('apps.products.urls')),
    path('api/stock/', include('apps.stock.urls')),
    path('api/customers/', include('apps.customers.urls')),
    path('api/orders/', include('apps.orders.urls')),
    path('api/', include('apps.notes.urls')),
]
