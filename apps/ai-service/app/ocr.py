"""Moteur OCR — wrapper mince autour de PaddleOCR.

Responsabilités uniquement :
1. charger le pipeline PaddleOCR *une seule fois par processus* (lazy) ;
2. exécuter l'inférence sur une image locale ;
3. transformer la sortie native en `OcrExtractionResult` sans toucher au
   contenu métier (aucune extraction de montant, référence, TVA…).

Le chargement est lazy pour deux raisons :
- l'import du module doit rester rapide (démarrage uvicorn, collecte pytest) ;
- les tests unitaires peuvent monkeypatcher `_get_engine` sans jamais
  déclencher le téléchargement des modèles.
"""
from __future__ import annotations

import logging
import os
import threading
from typing import TYPE_CHECKING, Any

from .schemas import OcrExtractionResult, OcrLine

if TYPE_CHECKING:
    # Import lourd — jamais évalué à l'import du module ni à la collecte de
    # tests. `TYPE_CHECKING` garde les annotations sans coût runtime.
    from paddleocr import PaddleOCR

logger = logging.getLogger(__name__)

# Modèles par défaut — cible POC : PP-OCRv6 small, plus légers et plus
# rapides que la variante medium au prix d'une précision légèrement moindre
# (validé sur images de synthèse : confiance > 0.98). Surchargeable via env
# pour A/B tester d'autres tailles sans changement de code.
_DEFAULT_DET_MODEL = os.environ.get('PADDLE_OCR_DET_MODEL', 'PP-OCRv6_small_det')
_DEFAULT_REC_MODEL = os.environ.get('PADDLE_OCR_REC_MODEL', 'PP-OCRv6_small_rec')
_DEFAULT_CPU_THREADS = int(os.environ.get('PADDLE_OCR_CPU_THREADS', '2'))


class OcrEngineError(RuntimeError):
    """Le moteur OCR a échoué de façon interne (chargement ou inférence).

    Distincte de `FileValidationError` : celle-ci arrive plus tôt et n'a
    rien à voir avec Paddle. Séparer les deux permet à l'endpoint de
    renvoyer 400 vs 500 sans ambiguïté.
    """


_engine_lock = threading.Lock()
_engine: 'PaddleOCR | None' = None


def _build_engine() -> 'PaddleOCR':
    """Construit le pipeline PaddleOCR — appelé une seule fois par processus.

    `enable_mkldnn=False` est indispensable : sur PaddlePaddle 3.3.x le
    chemin oneDNN de la PIR lève `NotImplementedError` sur les modèles
    PP-OCRv6 (`ConvertPirAttribute2RuntimeAttribute not support …`).
    Désactiver MKL-DNN restaure une inférence stable au prix de quelques
    millisecondes en plus par ligne — acceptable pour un POC.
    """
    from paddleocr import PaddleOCR

    logger.info(
        'Loading PaddleOCR pipeline (det=%s, rec=%s, threads=%d)',
        _DEFAULT_DET_MODEL, _DEFAULT_REC_MODEL, _DEFAULT_CPU_THREADS,
    )
    return PaddleOCR(
        text_detection_model_name=_DEFAULT_DET_MODEL,
        text_recognition_model_name=_DEFAULT_REC_MODEL,
        # Sous-modules désactivés : on ne veut que la brique OCR pure.
        # L'orientation / dewarping seront réévalués si la qualité l'exige.
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
        enable_mkldnn=False,
        cpu_threads=_DEFAULT_CPU_THREADS,
    )


def _get_engine() -> 'PaddleOCR':
    """Retourne l'instance PaddleOCR partagée, en la construisant si besoin.

    Verrouillé pour supporter les workers uvicorn multi-thread : un seul
    processus peut initialiser le pipeline à la fois.
    """
    global _engine
    if _engine is None:
        with _engine_lock:
            if _engine is None:
                _engine = _build_engine()
    return _engine


def _coerce_bbox(raw_box: Any) -> list[int]:  # noqa: ANN401
    """Normalise une bbox PaddleOCR vers `[x_min, y_min, x_max, y_max]`.

    Deux formats possibles selon la version :
    - rectangle direct : `[x_min, y_min, x_max, y_max]` (PP-OCRv6) ;
    - polygone 4 points : `[[x, y], [x, y], [x, y], [x, y]]` (versions plus
      anciennes) — on retombe sur le rectangle englobant.

    Retourne `[]` (liste vide) plutôt que de lever si la forme n'est pas
    reconnue : la bbox est un enrichissement, pas une exigence contractuelle.
    """
    if raw_box is None:
        return []
    # numpy.ndarray → list — on évite d'importer numpy pour un tolist().
    if hasattr(raw_box, 'tolist'):
        raw_box = raw_box.tolist()
    if not isinstance(raw_box, (list, tuple)) or len(raw_box) == 0:
        return []

    first = raw_box[0]
    # Rectangle direct : 4 scalaires numériques.
    if isinstance(first, (int, float)):
        if len(raw_box) != 4:
            return []
        try:
            return [int(round(float(v))) for v in raw_box]
        except (TypeError, ValueError):
            return []

    # Polygone : liste de points [x, y].
    if isinstance(first, (list, tuple)):
        try:
            xs = [float(pt[0]) for pt in raw_box]
            ys = [float(pt[1]) for pt in raw_box]
        except (TypeError, ValueError, IndexError):
            return []
        if not xs or not ys:
            return []
        return [
            int(round(min(xs))), int(round(min(ys))),
            int(round(max(xs))), int(round(max(ys))),
        ]
    return []


def _transform_result(raw: Any) -> OcrExtractionResult:  # noqa: ANN401
    """Convertit la sortie native PaddleOCR vers notre contrat interne.

    Sortie PaddleOCR (3.x) : liste d'objets `OCRResult` ; on prend le premier
    (une image = un document ici). Chaque `OCRResult` expose :
    - `rec_texts` : list[str]
    - `rec_scores` : list[float]
    - `rec_boxes` : list[list[int]]  (optionnel selon versions)

    Aucune donnée métier n'est produite : uniquement du texte brut, sa
    confiance atomique et la géométrie brute (`bbox`).
    """
    if isinstance(raw, list) and raw:
        first = raw[0]
    else:
        first = raw

    getter = first.get if hasattr(first, 'get') else lambda _k, default=None: default
    texts: list[str] = list(getter('rec_texts') or [])
    scores: list[float] = list(getter('rec_scores') or [])
    boxes_raw: list[Any] = list(getter('rec_boxes') or [])

    # Défensif : les trois listes devraient toujours avoir la même longueur.
    # `zip(..., strict=False)` s'arrête à la plus courte — on ne renvoie donc
    # que ce que Paddle a réellement fourni pour chaque triplet cohérent.
    triples = list(zip(
        texts,
        scores,
        # Padding avec `None` pour tolérer l'absence de bboxes sans perdre
        # les couples (texte, score) déjà valides.
        boxes_raw + [None] * max(0, len(texts) - len(boxes_raw)),
        strict=False,
    ))

    lines = [
        OcrLine(
            text=str(text),
            confidence=float(max(0.0, min(1.0, score))),
            bbox=_coerce_bbox(box),
        )
        for text, score, box in triples
    ]
    raw_text = '\n'.join(line.text for line in lines)
    confidence_score = (
        sum(line.confidence for line in lines) / len(lines) if lines else 0.0
    )
    return OcrExtractionResult(
        raw_text=raw_text,
        confidence_score=round(confidence_score, 6),
        lines=lines,
    )


def extract_text_from_image(image_path: str) -> OcrExtractionResult:
    """Exécute l'OCR sur une image locale et retourne le contrat interne.

    Toute exception native PaddleOCR — que ce soit lors du chargement /
    téléchargement du pipeline (`_get_engine`) ou lors de l'inférence
    (`engine.predict`) — est convertie en `OcrEngineError`. L'endpoint
    peut ainsi répondre 500 générique sans exposer la trace ni la chaîne
    d'imports Paddle.
    """
    try:
        engine = _get_engine()
    except Exception as exc:  # noqa: BLE001 — on relance en type domaine
        logger.exception('PaddleOCR pipeline initialization failed')
        raise OcrEngineError('Échec du moteur OCR.') from exc
    try:
        raw = engine.predict(image_path)
    except Exception as exc:  # noqa: BLE001 — on relance en type domaine
        logger.exception('PaddleOCR inference failed')
        raise OcrEngineError('Échec du moteur OCR.') from exc
    return _transform_result(raw)
