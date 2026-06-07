from django.urls import path

from .views import (
    CatalogDetailView,
    CatalogListCreateView,
    CatalogReorderView,
    ContactDetailView,
    ContactListCreateView,
    PageCoverView,
    PageLogoView,
    PublicPageView,
    PublishView,
    SectionDetailView,
    SectionListCreateView,
    SectionReorderView,
    UnpublishView,
)

urlpatterns = [
    path('', PublicPageView.as_view(), name='public-page'),
    path('publish/', PublishView.as_view(), name='public-page-publish'),
    path('unpublish/', UnpublishView.as_view(), name='public-page-unpublish'),
    path('logo/', PageLogoView.as_view(), name='public-page-logo'),
    path('cover/', PageCoverView.as_view(), name='public-page-cover'),

    path('sections/', SectionListCreateView.as_view(), name='public-page-sections'),
    path('sections/reorder/', SectionReorderView.as_view(), name='public-page-sections-reorder'),
    path('sections/<uuid:pk>/', SectionDetailView.as_view(), name='public-page-section-detail'),

    path('catalog/', CatalogListCreateView.as_view(), name='public-page-catalog'),
    path('catalog/reorder/', CatalogReorderView.as_view(), name='public-page-catalog-reorder'),
    path('catalog/<uuid:pk>/', CatalogDetailView.as_view(), name='public-page-catalog-detail'),

    path('contacts/', ContactListCreateView.as_view(), name='public-page-contacts'),
    path('contacts/<uuid:pk>/', ContactDetailView.as_view(), name='public-page-contact-detail'),
]
