"""Étalonnage du scan d'emballage : score par champ et par fournisseur.

Lit `tests/fixtures/product_scan/*.json` (attendu par photo : brand,
product_name, variant, net_quantity) et compare la lecture de chaque
fournisseur demandé :
- `rules` : règles locales seules (aucun appel externe) ;
- `openai` (ou tout nom de `vision/registry.py`) : structuration du texte,
  texte seul — la clé du fournisseur doit être exportée.

Les lignes OCR viennent du JSON (`ocr_lines`) ou, à défaut, de la photo
(`image`, `image_back`) rangée dans `tests/fixtures/product_scan/images/`
(dossier ignoré par Git : aucune image tierce n'est commitée). Voir le README
de ce dossier pour ajouter vos photos.

Usage (depuis le conteneur `ai-service`) :

    docker compose exec ai-service python scripts/eval_product_scan.py          # règles seules
    docker compose exec ai-service python scripts/eval_product_scan.py --providers rules,openai --details
    docker compose exec ai-service python scripts/eval_product_scan.py --reocr   # relit les photos

`--details` affiche les valeurs lues et attendues des champs manqués : à ne
partager qu'après relecture (texte des emballages).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.product_reading import normalize_text  # noqa: E402
from app.product_scan import _read_photo, _rule_fields, _structure  # noqa: E402
from app.schemas import ScanFieldProposal  # noqa: E402
from app.vision.base import ScanTextLine  # noqa: E402
from app.vision.registry import get_provider  # noqa: E402

FIXTURES = Path(__file__).resolve().parent.parent / 'tests' / 'fixtures' / 'product_scan'
FIELDS = ('brand', 'product_name', 'variant', 'net_quantity')


def _comparable(value: str | None) -> str:
    return re.sub(r'[\W_]+', '', normalize_text(value or ''))


def _lines(fixture: dict, *, reocr: bool) -> list[ScanTextLine] | None:
    if fixture.get('ocr_lines') and not reocr:
        return [ScanTextLine(**line) for line in fixture['ocr_lines']]
    lines: list[ScanTextLine] = []
    for side, key in (('face', 'image'), ('back', 'image_back')):
        if not fixture.get(key):
            continue
        path = FIXTURES / 'images' / fixture[key]
        if not path.exists():
            return None
        lines.extend(_read_photo(path.read_bytes(), side)[1])
    return lines or None


def _read(provider_name: str, lines: list[ScanTextLine]) -> dict[str, str | None]:
    if provider_name == 'rules':
        fields = _rule_fields(lines)
    else:
        reading, structuring = _structure(get_provider(provider_name), lines)
        if reading is None:
            print(f'  ! {provider_name} : structuration {structuring} (clé absente ou fournisseur en échec)')
            fields = {}
        else:
            fields = {key: reading.model_dump().get(key) for key in FIELDS}
    return {
        key: value.value if isinstance(value, ScanFieldProposal) else value
        for key, value in ((key, fields.get(key)) for key in FIELDS)
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        '--providers', default='rules',
        help='liste séparée par des virgules ; un fournisseur externe seulement si nommé (ex. rules,openai)',
    )
    parser.add_argument('--reocr', action='store_true', help='relire les photos même si ocr_lines est fourni')
    parser.add_argument('--details', action='store_true', help='afficher les valeurs des champs manqués')
    args = parser.parse_args()
    providers = [name.strip() for name in args.providers.split(',') if name.strip()]

    scores = {name: {field: [0, 0] for field in FIELDS} for name in providers}
    for path in sorted(FIXTURES.glob('*.json')):
        fixture = json.loads(path.read_text('utf-8'))
        lines = _lines(fixture, reocr=args.reocr)
        if lines is None:
            print(f'- {path.stem} : ignoré (ni ocr_lines ni photo dans images/)')
            continue
        print(f'- {path.stem}')
        for name in providers:
            read = _read(name, lines)
            for field in FIELDS:
                expected = fixture['expected'].get(field)
                hit = _comparable(read[field]) == _comparable(expected)
                scores[name][field][0] += hit
                scores[name][field][1] += 1
                if not hit and args.details:
                    print(f'  {name:>8} {field:<13} lu {read[field]!r}, attendu {expected!r}')

    print('\nScore (exact, sans casse ni accent ni ponctuation)')
    print(f"{'fournisseur':<12}" + ''.join(f'{field:>15}' for field in FIELDS))
    for name in providers:
        cells = ''.join(f'{f"{hit}/{total}":>15}' for hit, total in scores[name].values())
        print(f'{name:<12}{cells}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
