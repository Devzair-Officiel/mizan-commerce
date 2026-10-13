from django.db.models import F, OrderBy, QuerySet
from rest_framework import filters


class ProductOrderingFilter(filters.OrderingFilter):
    """Trie la liste Articles avec un départage stable (nom, puis identifiant).

    Les valeurs absentes vont en fin de liste dans les deux sens : un service
    au tri par stock, un article sans format actif au tri par prix.
    """

    def filter_queryset(self, request, queryset, view) -> QuerySet:
        terms = list(self.get_ordering(request, queryset, view) or ())
        fields = [term.lstrip('-') for term in terms]
        ordering: list[OrderBy] = [_order_by(term) for term in terms]
        ordering += [F(field).asc() for field in ('name', 'id') if field not in fields]
        return queryset.order_by(*ordering)


def _order_by(term: str) -> OrderBy:
    field = F(term.lstrip('-'))
    if term.startswith('-'):
        return field.desc(nulls_last=True)
    return field.asc(nulls_last=True)
