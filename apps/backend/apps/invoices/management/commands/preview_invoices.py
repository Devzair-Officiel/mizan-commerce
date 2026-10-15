from pathlib import Path

import pypdfium2 as pdfium
from django.core.management.base import BaseCommand

from apps.invoices.pdf import build_invoice_pdf
from apps.invoices.preview import reference_invoice


class Command(BaseCommand):
    help = 'Génère les PDF couleur, neutre, trois pages et leurs premières pages PNG.'

    def add_arguments(self, parser) -> None:
        parser.add_argument('--output', default='/app/artifacts/lot6')

    def handle(self, *args, **options) -> None:
        root = Path(options['output'])
        root.mkdir(parents=True, exist_ok=True)
        samples = {
            'facture-couleur': reference_invoice(),
            'facture-neutre': reference_invoice(neutral=True),
            'facture-3-pages': reference_invoice(lines=50),
        }
        for name, invoice in samples.items():
            pdf = build_invoice_pdf(invoice)
            with pdfium.PdfDocument(pdf) as document:
                if name == 'facture-3-pages' and len(document) != 3:
                    raise RuntimeError(
                        f'Exemple attendu sur 3 pages, obtenu {len(document)}'
                    )
                (root / f'{name}.pdf').write_bytes(pdf)
                page = document[0]
                bitmap = page.render(scale=4 / 3)
                bitmap.to_pil().save(root / f'{name}.png')
                bitmap.close()
                page.close()
                self.stdout.write(f'{root / name} : PDF {len(document)} page(s) + PNG')
