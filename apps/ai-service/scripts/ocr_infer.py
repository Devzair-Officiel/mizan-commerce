"""Script d'inférence PaddleOCR — usage manuel / QA.

Lance une vraie inférence hors de la suite de tests (qui reste rapide grâce
au mock). Utile pour :
- valider une nouvelle version PaddleOCR/PaddlePaddle avant de figer ;
- benchmarker le temps d'inférence sur des factures réelles ;
- inspecter le contrat JSON généré à partir d'images du disque.

Aucune facture réelle ne doit être committée avec ce script.

Usage (depuis le conteneur `ai-service`) :

    docker compose exec ai-service python scripts/ocr_infer.py /chemin/image.jpg
    docker compose exec ai-service python scripts/ocr_infer.py img1.png img2.jpg
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

# Permet de lancer le script sans devoir configurer PYTHONPATH.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.ocr import extract_text_from_image  # noqa: E402


def _run_one(path: str) -> None:
    if not Path(path).is_file():
        print(f'[SKIP] {path} — fichier introuvable', file=sys.stderr)
        return
    t0 = time.time()
    result = extract_text_from_image(path)
    dt = time.time() - t0
    print(f'\n=== {path} ({dt:.2f}s) ===')
    print(f'lines={len(result.lines)}  confidence={result.confidence_score:.4f}')
    print(json.dumps(result.model_dump(), ensure_ascii=False, indent=2))


def main() -> None:
    if len(sys.argv) < 2:
        print('usage: ocr_infer.py <image> [<image> ...]', file=sys.stderr)
        sys.exit(2)
    for path in sys.argv[1:]:
        _run_one(path)


if __name__ == '__main__':
    main()
