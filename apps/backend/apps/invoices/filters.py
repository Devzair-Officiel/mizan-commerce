from django.db.models import Case, F, IntegerField, OrderBy, QuerySet, Value, When
from rest_framework import filters


INVOICE_SEARCH_FIELDS = ('number', 'buyer_name')


def _order_by(term: str) -> OrderBy:
    """Un brouillon n'a ni date d'émission ni échéance : place des NULL explicite.

    Par date d'émission décroissante (tri par défaut), les brouillons viennent en
    tête ; en croissante, en fin. Sans échéance, toujours en fin.
    """
    descending = term.startswith('-')
    name = term.lstrip('-').replace('status', 'status_rank')
    if name == 'issued_at':
        return F(name).desc(nulls_first=True) if descending else F(name).asc(nulls_last=True)  # noqa: E501
    nulls_last = True if name == 'due_date' else None
    if descending:
        return F(name).desc(nulls_last=nulls_last)
    return F(name).asc(nulls_last=nulls_last)


class InvoiceOrderingFilter(filters.OrderingFilter):
    """Statut dans l'ordre du parcours, puis date et identifiant stables.

    Entre brouillons, le dernier modifié d'abord (`draft_updated`, NULL pour une
    facture émise).
    """

    def filter_queryset(self, request, queryset, view) -> QuerySet:
        queryset = queryset.annotate(
            status_rank=Case(
                When(status='draft', then=Value(0)),
                When(status='issued', then=Value(1)),
                When(status='paid', then=Value(2)),
                default=Value(3),
                output_field=IntegerField(),
            ),
            draft_updated=Case(When(status='draft', then=F('updated_at'))),
        )
        ordering = list(self.get_ordering(request, queryset, view) or ['-issued_at'])
        if not any(term.lstrip('-') == 'issued_at' for term in ordering):
            ordering.append('-issued_at')
        return queryset.order_by(
            *(_order_by(term) for term in ordering),
            F('draft_updated').desc(nulls_last=True),
            '-pk',
        )
