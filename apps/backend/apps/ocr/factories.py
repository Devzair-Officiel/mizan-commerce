import uuid

import factory
from django.utils import timezone
from factory.django import DjangoModelFactory

from apps.accounts.factories import UserFactory
from apps.products.factories import ProductVariantFactory
from apps.shops.factories import ShopFactory

from .models import OcrResult, ProductScanUsage, SupplierLineMatch, UploadedDocument


class UploadedDocumentFactory(DjangoModelFactory):
    class Meta:
        model = UploadedDocument

    shop = factory.SubFactory(ShopFactory)
    uploaded_by_user = factory.SubFactory(UserFactory)
    document_type = UploadedDocument.DOCUMENT_TYPE_SUPPLIER_INVOICE
    object_key = factory.LazyAttribute(
        lambda o: f'ocr/{o.shop.pk}/supplier-invoices/{uuid.uuid4()}.jpg'
    )
    original_filename = factory.Faker('file_name', extension='jpg')
    mime_type = 'image/jpeg'
    size_bytes = factory.Faker('random_int', min=10_000, max=500_000)


class OcrResultFactory(DjangoModelFactory):
    class Meta:
        model = OcrResult

    shop = factory.SubFactory(ShopFactory)
    uploaded_document = factory.SubFactory(
        UploadedDocumentFactory,
        shop=factory.SelfAttribute('..shop'),
    )
    status = OcrResult.STATUS_PENDING


class SupplierLineMatchFactory(DjangoModelFactory):
    """Association mémorisée : libellé d'un fournisseur → format (clés normalisées).

    `SupplierLineMatchFactory(ignored=True, shop=…)` : ligne ignorée, sans format.
    """

    class Meta:
        model = SupplierLineMatch

    class Params:
        ignored = factory.Trait(
            variant=None, is_ignored=True,
            shop=factory.SubFactory(ShopFactory),
        )

    variant = factory.SubFactory(ProductVariantFactory)
    shop = factory.SelfAttribute('variant.shop')
    supplier_key = 'lin co'
    label_key = factory.Sequence(lambda n: f'article fournisseur {n}')
    created_by = factory.SubFactory(UserFactory)


class ProductScanUsageFactory(DjangoModelFactory):
    """Compteur mensuel du secours vision (scan d'emballage, URS-109)."""

    class Meta:
        model = ProductScanUsage

    shop = factory.SubFactory(ShopFactory)
    month = factory.LazyFunction(lambda: timezone.localdate().replace(day=1))
    vision_count = 0
