from django.db.models import Case, IntegerField, QuerySet, Value, When
from rest_framework import filters


INVOICE_SEARCH_FIELDS = ("number", "buyer_name")


class InvoiceOrderingFilter(filters.OrderingFilter):
    """Statut dans l'ordre du parcours, puis date et identifiant stables."""

    def filter_queryset(self, request, queryset, view) -> QuerySet:
        queryset = queryset.annotate(
            status_rank=Case(
                When(status="issued", then=Value(0)),
                When(status="paid", then=Value(1)),
                default=Value(2),
                output_field=IntegerField(),
            )
        )
        ordering = self.get_ordering(request, queryset, view) or ["-issued_at"]
        terms = [term.replace("status", "status_rank") for term in ordering]
        if not any(term.lstrip("-") == "issued_at" for term in terms):
            terms.append("-issued_at")
        return queryset.order_by(*terms, "-pk")
