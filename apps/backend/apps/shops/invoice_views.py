from django.http import HttpResponse
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.views import APIView

from apps.core.permissions import IsShopAdmin, get_shop
from apps.invoices.pdf import build_invoice_pdf
from apps.invoices.settings import example_invoice
from apps.shops.models import Shop
from .invoice_serializers import InvoiceSettingsSerializer


class InvoiceSettingsView(generics.RetrieveUpdateAPIView):
    permission_classes = (IsAuthenticated, IsShopAdmin)
    serializer_class = InvoiceSettingsSerializer
    http_method_names = ('get', 'patch', 'head', 'options')

    def get_object(self) -> Shop:
        return get_shop(self.request.user)


class InvoiceExamplePdfView(APIView):
    permission_classes = (IsAuthenticated, IsShopAdmin)

    def get(self, request: Request) -> HttpResponse:
        invoice = example_invoice(get_shop(request.user), request.user.language)
        response = HttpResponse(
            build_invoice_pdf(invoice), content_type='application/pdf'
        )
        response['Content-Disposition'] = 'attachment; filename="exemple-facture.pdf"'
        response['Cache-Control'] = 'private, no-store'
        return response
