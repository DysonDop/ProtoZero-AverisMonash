"""Shared machinery for the per-format readers.

The readers differ in how they find a (label, value) pair; everything after
that — validating the value shape, deciding which of several hits wins, and
recording evidence — is the same, and lives here.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field as dc_field

from pipeline.labels import is_total_label, resolve
from pipeline.schemas import FIELD_NAMES, ExtractedField, Locator, ShipmentFields

# --------------------------------------------------------------------------
# Value shape validation
# --------------------------------------------------------------------------
#
# This is what stops the PDF container table from poisoning gross weight. On a
# PDF, `GROSS WEIGHT (KG)` is a COLUMN HEADER; the line after it is a container
# number like `QETO1681572`. Stripping non-digits from that yields a plausible
# looking integer, so a normaliser alone will not catch it — the value has to
# be rejected at the point of extraction, on its shape.

_WEIGHT_SHAPE = re.compile(r"^\s*\d[\d,.\s]*\s*(KGS?|MTS?|LBS?)?\s*$", re.I)
_CONTAINER_SHAPE = re.compile(r"^\s*\d+\s*(?:[xX×]\s*\S+.*)?$")
_CONTAINER_NUMBER = re.compile(r"^[A-Z]{3,4}\d{6,7}$")  # ISO container number

# Placeholder forms count as valid: a blank is a real extraction whose value
# happens to be missing, and it must reach the comparator as ABSENT rather than
# being silently skipped in favour of the next candidate line.
_PLACEHOLDER = re.compile(r"^\s*(?:_{2,}|\?{2,}|N/?A|TBA|TBD|-{1,2})\s*(?:MTS?|KGS?)?\s*$", re.I)


def value_is_plausible(field: str, value: str | None) -> bool:
    if value is None:
        return False
    v = value.strip()
    if not v:
        return True  # an empty value after a real label is a genuine blank
    if _PLACEHOLDER.match(v):
        return True
    if field == "gross_weight_kg":
        return bool(_WEIGHT_SHAPE.match(v)) and not _CONTAINER_NUMBER.match(v)
    if field == "container_count":
        return bool(_CONTAINER_SHAPE.match(v)) and not _CONTAINER_NUMBER.match(v)
    if field in ("port_of_loading", "port_of_discharge"):
        # A port is words, not a bare number or an ISO container id.
        return not v.isdigit() and not _CONTAINER_NUMBER.match(v) and len(v) >= 2
    # Parties: any non-numeric text.
    return not v.isdigit() and len(v) >= 2


# --------------------------------------------------------------------------
# Hit accumulation
# --------------------------------------------------------------------------


@dataclass
class Hit:
    field: str
    value: str
    evidence: str
    label_seen: str
    directness: float
    is_total: bool
    locator: Locator = dc_field(default_factory=Locator)


class HitBag:
    """Collects candidate hits and resolves which one wins per field.

    Precedence, in order:
      1. a `TOTAL ...` label beats a plain one (PDF totals row over column header)
      2. a direct synonym hit beats a containment hit
      3. first occurrence wins
    """

    def __init__(self) -> None:
        self._hits: dict[str, list[Hit]] = {}

    def add(
        self,
        raw_label: str,
        value: str | None,
        *,
        evidence: str = "",
        locator: Locator | None = None,
    ) -> str | None:
        field, directness = resolve(raw_label)
        if field is None:
            return None
        if not value_is_plausible(field, value):
            return None
        hit = Hit(
            field=field,
            value=(value or "").strip(),
            evidence=(evidence or value or "").strip(),
            label_seen=raw_label.strip(),
            directness=directness,
            is_total=is_total_label(raw_label),
            locator=locator or Locator(),
        )
        self._hits.setdefault(field, []).append(hit)
        return field

    def best(self, field: str) -> Hit | None:
        hits = self._hits.get(field)
        if not hits:
            return None
        return sorted(
            enumerate(hits),
            key=lambda pair: (not pair[1].is_total, -pair[1].directness, pair[0]),
        )[0][1]

    def to_fields(self, extracted_by: str = "parser") -> ShipmentFields:
        out = ShipmentFields()
        for name in FIELD_NAMES:
            hit = self.best(name)
            if hit is None:
                continue
            setattr(
                out,
                name,
                ExtractedField(
                    value=hit.value or None,
                    evidence=hit.evidence or None,
                    label_seen=hit.label_seen,
                    locator=hit.locator,
                    extracted_by=extracted_by,  # type: ignore[arg-type]
                ),
            )
        return out

    def label_directness(self, field: str) -> float:
        hit = self.best(field)
        return hit.directness if hit else 0.0


def sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", errors="replace")).hexdigest()


def split_label_value(line: str, known_labels: list[str] | None = None) -> tuple[str, str] | None:
    """Split `Label: value` on the first colon that isn't inside a bracket.

    Returns None when the line carries no colon — the caller then tries the
    block form (label alone, value on the next line) and the glued form.
    """
    depth = 0
    for i, ch in enumerate(line):
        if ch in "(（[":
            depth += 1
        elif ch in ")）]":
            depth = max(0, depth - 1)
        elif ch in ":：" and depth == 0:
            return line[:i].strip(), line[i + 1 :].strip()
    return None
