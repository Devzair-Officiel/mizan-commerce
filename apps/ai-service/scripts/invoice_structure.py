"""Script d'appel manuel de `POST /internal/invoice/structure`.

Enchaîne OCR (interne au service) + structuration LLM (OpenAI) sur une
image locale, sans passer par Django. Utile pour :

- valider l'appel réel OpenAI avec une facture de test locale ;
- benchmarker la latence LLM sur des factures représentatives ;
- inspecter la qualité de l'association description/prix/quantité proposée
  par le modèle sur un échantillon.

Aucune facture réelle ne doit être committée avec ce script. Aucun log de
la sortie brute ne doit être partagé sans revue préalable (contient le
texte OCR de la facture soumise).

Usage (depuis le conteneur `ai-service`, avec OPENAI_API_KEY exportée) :

    docker compose exec ai-service python scripts/invoice_structure.py /chemin/facture.jpg
    docker compose exec ai-service python scripts/invoice_structure.py -j /chemin/ocr.json

Le mode `-j` lit un JSON local `{raw_text, lines}` (par exemple obtenu depuis
la sortie de `scripts/ocr_infer.py`) et évite de retélécharger PaddleOCR
si l'image a déjà été traitée localement.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.invoice_extraction import (  # noqa: E402
    InvoiceExtractionError,
    extract_invoice_structure,
)
from app.ocr import extract_text_from_image  # noqa: E402
from app.schemas import InvoiceStructureRequest, OcrLine  # noqa: E402


def _load_from_image(path: str) -> InvoiceStructureRequest:
    ocr = extract_text_from_image(path)
    return InvoiceStructureRequest(
        raw_text=ocr.raw_text,
        lines=[OcrLine(text=line.text, confidence=line.confidence, bbox=line.bbox)
               for line in ocr.lines],
    )


def _load_from_json(path: str) -> InvoiceStructureRequest:
    with Path(path).open('r', encoding='utf-8') as fp:
        payload = json.load(fp)
    return InvoiceStructureRequest(
        raw_text=str(payload.get('raw_text', '')),
        lines=[OcrLine(**entry) for entry in payload.get('lines', [])],
    )


def _run(request: InvoiceStructureRequest) -> None:
    t0 = time.time()
    result = extract_invoice_structure(request)
    elapsed = time.time() - t0
    print(f'=== elapsed={elapsed:.2f}s  ocr_lines={len(request.lines)} ===')
    print(json.dumps(result.model_dump(), ensure_ascii=False, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('path', help='Chemin de l\'image (JPG/PNG/WebP) ou du JSON OCR')
    parser.add_argument(
        '-j', '--json', action='store_true',
        help='Interprète PATH comme un JSON déjà généré (raw_text + lines).',
    )
    args = parser.parse_args()

    if not os.environ.get('OPENAI_API_KEY'):
        print(
            'ERREUR : OPENAI_API_KEY absent de l\'environnement.',
            file=sys.stderr,
        )
        sys.exit(2)

    if not Path(args.path).is_file():
        print(f'ERREUR : fichier introuvable — {args.path}', file=sys.stderr)
        sys.exit(2)

    request = _load_from_json(args.path) if args.json else _load_from_image(args.path)

    try:
        _run(request)
    except InvoiceExtractionError as exc:
        print(f'ERREUR extraction : {exc}', file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
