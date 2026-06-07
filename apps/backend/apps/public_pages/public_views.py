"""Vues publiques de la vitrine (lecture seule, sans authentification).

Toute requête est anonyme. On expose uniquement les pages `is_live` :
celles qui sont `is_active=True` ET `is_published=True`. Toute autre page
renvoie 404, sans révéler si la boutique existe ou non (évite de
divulguer l'existence d'une page en brouillon).

Mode preview (`?preview=1`) : autorise un admin de la boutique à voir sa
page même non publiée. Utilisé par l'aperçu live dans l'éditeur. L'auth
JWT est requise et l'admin doit être membre de la boutique propriétaire.
"""

from __future__ import annotations

from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import get_member

from .models import PublicPage
from .public_serializers import PublicPageReadSerializer


def _is_preview_request(request) -> bool:
    return request.query_params.get('preview') in ('1', 'true')


class PublicShopView(APIView):
    permission_classes = (AllowAny,)

    def get(self, request, slug: str) -> Response:
        if _is_preview_request(request):
            page = self._get_preview_page(request, slug)
        else:
            page = get_object_or_404(
                PublicPage.objects.select_related('shop'),
                slug=slug,
                is_active=True,
                is_published=True,
            )
        return Response(PublicPageReadSerializer(page).data)

    def _get_preview_page(self, request, slug: str) -> PublicPage:
        # Preview = admin authentifié de la boutique propriétaire de la page.
        # 404 si l'auth manque, pour ne pas révéler l'existence d'une page non publiée.
        if not request.user or not request.user.is_authenticated:
            raise PermissionDenied('Aperçu réservé aux administrateurs.')
        try:
            member = get_member(request.user)
        except PermissionDenied:
            raise PermissionDenied('Aperçu réservé aux administrateurs.')
        if not member.is_admin:
            raise PermissionDenied('Aperçu réservé aux administrateurs.')
        return get_object_or_404(
            PublicPage.objects.select_related('shop'),
            slug=slug,
            shop=member.shop,
        )
