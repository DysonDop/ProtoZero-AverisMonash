"""Stage 5 — compare. The SI is the reference.

The model never reaches this file. Extraction may be probabilistic; comparison
is code, and it is exact. `rapidfuzz` appears here for exactly one purpose —
routing a near-miss to a human — and it can never produce MATCH. Two values
that are not equal after normalisation are never declared equal.
"""

from __future__ import annotations

from rapidfuzz import fuzz

from pipeline.config import BORDERLINE_HIGH, BORDERLINE_LOW
from pipeline.confidence import score_field
from pipeline.normalize import is_blank, normalise
from pipeline.schemas import (
    FIELD_ORDER,
    ExtractedField,
    FieldComparison,
    ShipmentFields,
)

_LABELS = {
    "shipper": "shipper",
    "consignee": "consignee",
    "notify_party": "notify party",
    "port_of_loading": "port of loading",
    "port_of_discharge": "port of discharge",
    "container_count": "container count",
    "gross_weight_kg": "gross weight (kg)",
}


def _as_text(value) -> str:
    return "" if value is None else str(value)


def compare_documents(
    si_fields: ShipmentFields,
    bl_fields: ShipmentFields,
    *,
    si_fmt: str,
    bl_fmt: str,
    si_text: str = "",
    bl_text: str = "",
    cross_checks: dict[str, float] | None = None,
    label_directness: dict[str, float] | None = None,
) -> list[FieldComparison]:
    out: list[FieldComparison] = []
    cross_checks = cross_checks or {}
    label_directness = label_directness or {}

    for field in FIELD_ORDER:
        si: ExtractedField = si_fields.get(field)
        bl: ExtractedField = bl_fields.get(field)

        si_norm = normalise(field, si.value)
        bl_norm = normalise(field, bl.value)

        si_missing = si.value is None or is_blank(si.value) or si_norm is None
        bl_missing = bl.value is None or is_blank(bl.value) or bl_norm is None

        similarity = None

        if si_missing or bl_missing:
            # A blank is uncertainty, not a discrepancy. It must never become
            # a MISMATCH — that would be inventing a defect out of a gap.
            verdict = "ABSENT"
            explanation = _explain_absent(field, si, bl, si_missing, bl_missing)
        elif si_norm == bl_norm:
            verdict = "MATCH"
            explanation = f"{_LABELS[field]} — match"
        else:
            similarity = float(
                fuzz.token_sort_ratio(_as_text(si_norm), _as_text(bl_norm))
            )
            if BORDERLINE_LOW <= similarity < BORDERLINE_HIGH:
                verdict = "REVIEW"
                explanation = (
                    f"{_LABELS[field]} — near match ({similarity:.0f}%), "
                    f"SI: {si.value} / BL: {bl.value}"
                )
            else:
                verdict = "MISMATCH"
                explanation = f"{_LABELS[field]} — SI: {si.value} / BL: {bl.value}"

        confidence = score_field(
            field,
            si,
            bl,
            si_fmt=si_fmt,
            bl_fmt=bl_fmt,
            parse_valid=not (si_missing or bl_missing),
            grounded=_grounded(si, si_text) and _grounded(bl, bl_text),
            cross_check=cross_checks.get(field, 0.5),
            label_directness=label_directness.get(field, 1.0),
        )

        out.append(
            FieldComparison(
                field=field,
                si=si,
                bl=bl,
                si_normalized=None if si_norm is None else str(si_norm),
                bl_normalized=None if bl_norm is None else str(bl_norm),
                verdict=verdict,
                similarity=similarity,
                confidence=confidence,
                explanation=explanation,
            )
        )
    return out


def _explain_absent(field, si, bl, si_missing, bl_missing) -> str:
    label = _LABELS[field]
    if si_missing and bl_missing:
        return f"{label} — not found in either document"
    where = "SI" if si_missing else "draft BL"
    other = bl.value if si_missing else si.value
    return f"{label} — missing or blank in the {where} (other document says: {other})"


def _grounded(field: ExtractedField, text: str) -> bool:
    """Parser-extracted fields are grounded by construction."""
    if field.extracted_by == "parser" or not field.evidence:
        return True
    if not text:
        return True
    snippet = field.evidence.split("\n")[0].strip()
    if snippet and snippet in text:
        return True
    return fuzz.partial_ratio(snippet, text) >= 90
