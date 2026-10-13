from collections.abc import Callable, Sequence
from typing import Any, TypeVar

from django.db.models import QuerySet
from rest_framework.pagination import LimitOffsetPagination, PageNumberPagination
from rest_framework.request import Request
from rest_framework.response import Response

E = TypeVar('E', bound=Any)

# Une source de timeline : un queryset trié du plus récent au plus ancien (même date
# que `occurred_at`, puis un départage stable) et la fonction qui en fait un événement.
TimelineSource = tuple[QuerySet, Callable[[Any], E]]


def window_timeline(
    sources: Sequence[TimelineSource], offset: int, limit: int,
) -> tuple[list[E], int]:
    """Fenêtre `[offset, offset + limit)` d'une timeline fusionnée de plusieurs sources.

    Chaque source ne lit que ses `offset + limit` premières lignes : la fenêtre de la
    fusion en fait forcément partie. Égalité de date : ordre des sources, puis ordre
    de chaque source (tri stable), le même d'une fenêtre à l'autre.
    Retourne la fenêtre et le nombre total d'événements.
    """
    end = offset + limit
    events = [to_event(row) for qs, to_event in sources for row in qs[:end]]
    events.sort(key=lambda e: e['occurred_at'], reverse=True)
    return events[offset:end], sum(qs.count() for qs, _ in sources)


class WindowPagination(LimitOffsetPagination):
    """Pagination par fenêtre (`limit`, `offset`) : listes « Voir plus » des fiches."""
    default_limit = 20
    max_limit = 100

    def paginate_timeline(
        self, sources: Sequence[TimelineSource], request: Request,
    ) -> list:
        """Fenêtre d'une timeline fusionnée (voir `window_timeline`)."""
        self.request = request
        self.limit = self.get_limit(request)
        self.offset = self.get_offset(request)
        page, self.count = window_timeline(sources, self.offset, self.limit)
        return page


class FlexiblePageNumberPagination(PageNumberPagination):
    """Pagination par page ; par fenêtre quand la requête passe `limit` ou `offset`."""
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100
    window: WindowPagination | None = None

    def paginate_queryset(self, queryset, request: Request, view=None):
        if 'limit' in request.query_params or 'offset' in request.query_params:
            self.window = WindowPagination()
            return self.window.paginate_queryset(queryset, request, view)
        return super().paginate_queryset(queryset, request, view)

    def get_paginated_response(self, data) -> Response:
        if self.window is not None:
            return self.window.get_paginated_response(data)
        return super().get_paginated_response(data)
