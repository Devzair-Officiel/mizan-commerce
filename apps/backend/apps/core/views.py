from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .permissions import HasModulePermission, get_member
from .services import (
    SALES_PERIODS, build_dashboard_today, build_nav_badges, build_sales, global_search,
)

HasDashboardModule = HasModulePermission.for_module('dashboard')


class DashboardTodayView(APIView):
    permission_classes = (IsAuthenticated, HasDashboardModule)

    def get(self, request):
        member = get_member(request.user)
        return Response(build_dashboard_today(member.shop, member=member))


class DashboardSalesView(APIView):
    """Bloc Ventes de l'accueil : `period` = 7d (défaut) | 12m | all."""
    permission_classes = (IsAuthenticated, HasDashboardModule)

    def get(self, request):
        period = request.query_params.get('period', '7d')
        if period not in SALES_PERIODS:
            raise ValidationError({'period': 'Période inconnue.'})
        return Response(build_sales(get_member(request.user).shop, period))


class DashboardBadgesView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        member = get_member(request.user)
        return Response(build_nav_badges(member.shop, member))


class GlobalSearchView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        q = request.query_params.get('q', '').strip()
        _e: dict = {'total': 0, 'items': []}
        empty = {'products': _e, 'customers': _e, 'orders': _e}
        if len(q) < 2:
            return Response(empty)
        member = get_member(request.user)
        return Response(global_search(member.shop, member, q))
