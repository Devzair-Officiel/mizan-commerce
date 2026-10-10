from django.db.models import Case, F, IntegerField, OrderBy, QuerySet, Value, When
from rest_framework import filters

# Champs de recherche de la liste, partagés avec les facettes.
ORDER_SEARCH_FIELDS = ('order_number', 'customer__name', 'customer__phone')

# Ordre du parcours : à traiter < prête < remise < annulée.
STATUS_RANK = {'to_prepare': 0, 'prepared': 1, 'shipped': 2, 'cancelled': 3}
# Ordre d'encaissement : non payée < partiel < payée.
PAYMENT_RANK = {'unpaid': 0, 'partial': 1, 'paid': 2}


def _rank(field: str, ranks: dict[str, int]) -> Case:
    return Case(
        *(When(**{field: value}, then=Value(rank)) for value, rank in ranks.items()),
        default=Value(len(ranks)),
        output_field=IntegerField(),
    )


def annotate_ranks(qs: QuerySet) -> QuerySet:
    return qs.annotate(
        status_rank=_rank('status', STATUS_RANK),
        payment_rank=_rank('payment_status', PAYMENT_RANK),
    )


class OrderOrderingFilter(filters.OrderingFilter):
    """Trie statut et paiement selon le parcours, puis départage par date.

    `?ordering=status` trie sur le rang annoté (voir `annotate_ranks`), pas
    sur l'ordre alphabétique du code. Le départage par `-created_at` garde
    une pagination stable quand plusieurs commandes ont la même valeur.
    Les valeurs nulles (commande sans client) restent en fin de liste dans
    les deux sens.
    """

    ALIASES = {'status': 'status_rank', 'payment_status': 'payment_rank'}

    def get_ordering(self, request, queryset, view) -> list[str]:
        ordering = []
        for term in super().get_ordering(request, queryset, view) or ():
            desc = term.startswith('-')
            field = self.ALIASES.get(term.lstrip('-'), term.lstrip('-'))
            ordering.append(f'-{field}' if desc else field)
        if not any(term.lstrip('-') == 'created_at' for term in ordering):
            ordering.append('-created_at')
        return ordering

    def filter_queryset(self, request, queryset, view) -> QuerySet:
        ordering = self.get_ordering(request, queryset, view)
        return queryset.order_by(*(_nulls_last(term) for term in ordering))


def _nulls_last(term: str) -> OrderBy:
    field = F(term.lstrip('-'))
    if term.startswith('-'):
        return field.desc(nulls_last=True)
    return field.asc(nulls_last=True)
