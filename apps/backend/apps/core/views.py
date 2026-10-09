from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .permissions import HasModulePermission, get_member, get_shop
from .services import build_dashboard_today, build_nav_badges, global_search

HasDashboardModule = HasModulePermission.for_module('dashboard')


class DashboardTodayView(APIView):
    permission_classes = (IsAuthenticated, HasDashboardModule)

    def get(self, request):
        shop = get_shop(request.user)
        return Response(build_dashboard_today(shop))


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
