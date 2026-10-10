from django.db.models import F, OrderBy, QuerySet
from rest_framework import filters

# Tris issus des commandes : les clients sans commande restent en fin de liste.
ORDER_DERIVED = frozenset(
    {'pending_amount', 'paid_amount', 'order_count', 'last_order_at'},
)


class CustomerOrderingFilter(filters.OrderingFilter):
    """Trie la liste Clients avec un départage stable (nom, puis identifiant).

    Pour un tri issu des commandes, `has_orders` passe d'abord : un client sans
    commande va en fin de liste, dans les deux sens.
    """

    def filter_queryset(self, request, queryset, view) -> QuerySet:
        terms = list(self.get_ordering(request, queryset, view) or ())
        fields = [term.lstrip('-') for term in terms]
        ordering: list[OrderBy] = []
        if ORDER_DERIVED & set(fields):
            ordering.append(F('has_orders').desc())
        ordering += [_order_by(term) for term in terms]
        ordering += [F(field).asc() for field in ('name', 'id') if field not in fields]
        return queryset.order_by(*ordering)


def _order_by(term: str) -> OrderBy:
    field = F(term.lstrip('-'))
    if term.startswith('-'):
        return field.desc(nulls_last=True)
    return field.asc(nulls_last=True)
