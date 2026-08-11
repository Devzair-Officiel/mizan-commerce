import uuid

import factory
from factory.django import DjangoModelFactory

from apps.accounts.factories import UserFactory
from apps.shops.factories import ShopFactory

from .models import OcrResult, UploadedDocument


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
