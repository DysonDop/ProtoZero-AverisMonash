"""Per-field confidence.

Two hard gates and a weighted sum. The weighting is deliberate: an LLM's
self-reported confidence is a weak routing signal, so it carries the least
weight, while grounding, cross-checks and a service's own measured confidence
carry the most. Any hard gate sends the field to review regardless of score.
"""

from __future__ import annotations

from pipeline.config import CONFIDENCE_WEIGHTS, DOC_QUALITY, REVIEW_THRESHOLD
from pipeline.schemas import ConfidenceBreakdown, ExtractedField


def score_field(
    field: str,
    si: ExtractedField,
    bl: ExtractedField,
    *,
    si_fmt: str,
    bl_fmt: str,
    parse_valid: bool,
    grounded: bool,
    cross_check: float = 0.5,
    label_directness: float = 1.0,
) -> ConfidenceBreakdown:
    doc_quality = min(DOC_QUALITY.get(si_fmt, 0.9), DOC_QUALITY.get(bl_fmt, 0.9))

    service = [c for c in (si.service_confidence, bl.service_confidence) if c is not None]
    service_confidence = min(service) if service else 0.5

    model = [c for c in (si.model_confidence, bl.model_confidence) if c is not None]
    # 0.5 when a parser did the work — neutral, not 1.0. A parser is trusted
    # through `grounded`, not through a self-rating it never made.
    model_selfrating = min(model) if model else 0.5

    components = {
        "cross_check": cross_check,
        "doc_quality": doc_quality,
        "label_directness": label_directness,
        "service_confidence": service_confidence,
        "model_selfrating": model_selfrating,
    }
    total_weight = sum(CONFIDENCE_WEIGHTS.values())
    score = sum(CONFIDENCE_WEIGHTS[k] * v for k, v in components.items()) / total_weight

    hard_fail = None
    if not grounded:
        hard_fail = "GROUNDING_FAILED"
    elif not parse_valid:
        hard_fail = "FIELD_NOT_FOUND"
    elif score < REVIEW_THRESHOLD:
        hard_fail = "LOW_CONFIDENCE"

    return ConfidenceBreakdown(
        grounded=1.0 if grounded else 0.0,
        parse_valid=1.0 if parse_valid else 0.0,
        cross_check=cross_check,
        doc_quality=doc_quality,
        service_confidence=service_confidence,
        model_selfrating=model_selfrating,
        label_directness=label_directness,
        score=round(score, 4),
        hard_fail=hard_fail,
    )
