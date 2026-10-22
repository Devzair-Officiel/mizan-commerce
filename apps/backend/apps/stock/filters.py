from django.db.models import F, OrderBy, QuerySet
from rest_framework import filters
from rest_framework.request import Request
from rest_framework.views import APIView


class LevelOrderingFilter(filters.OrderingFilter):
    """Tri des niveaux : stock (défaut, croissant), nom, valeur, dernier mouvement.

    Liste blanche : un autre terme revient au tri par défaut. Valeurs absentes en
    fin de liste ; départage par nom d'article, format, identifiant. Partagé par la
    liste des niveaux et l'export du stock.
    """
    FIELDS = {
        'stock': ('stock_quantity',),
        'name': ('product__name', 'packaging_name'),
        'purchase_value': ('purchase_value',),
        'last_movement': ('last_movement_at',),
    }

    def filter_queryset(
        self, request: Request, queryset: QuerySet, view: APIView,
    ) -> QuerySet:
        term = request.query_params.get(self.ordering_param, 'stock')
        key = term.lstrip('-')
        if key not in self.FIELDS:
            term, key = 'stock', 'stock'
        desc = term.startswith('-')
        ordering: list[OrderBy] = [
            F(field).desc(nulls_last=True) if desc else F(field).asc(nulls_last=True)
            for field in self.FIELDS[key]
        ]
        ordering += [F(f).asc() for f in ('product__name', 'packaging_name', 'id')]
        return queryset.order_by(*ordering)
