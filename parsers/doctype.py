"""Document type detection — from CONTENT, never from the filename.

The `_SI` / `_BL` suffix in an attachment name is a PAIRING hint only. The
corpus ships a Commercial Invoice named `..._BL.txt`; trusting the filename
turns a `wrong_doc_type` escalation into a confident, wrong comparison.
"""

from __future__ import annotations

import re

from pipeline.schemas import DocKind

_MARKERS: list[tuple[str, DocKind]] = [
    (r"BILL OF LADING INSTRUCTION", "SI"),
    (r"\bBL INSTRUCTION\b", "SI"),
    (r"SHIPPING INSTRUCTION", "SI"),
    (r"BILL OF LADING", "BL"),
    (r"COMMERCIAL INVOICE", "COMMERCIAL_INVOICE"),
    (r"PACKING LIST", "PACKING_LIST"),
    (r"CERTIFICATE OF ORIGIN", "CERTIFICATE_OF_ORIGIN"),
]

_MIN_FIELDS_FOR_UNKNOWN = 4


def detect(
    text: str, *, sheet_names: list[str] | None = None, fields_found: int = 0
) -> DocKind:
    head = "\n".join((text or "").splitlines()[:40]).upper()

    # Sheet names are a strong, cheap signal in xlsx and are checked first
    # because the workbook's own header row can read `BILL OF LADING` on an SI.
    for name in sheet_names or []:
        n = name.strip().upper().replace(".", "")
        if n in ("SI", "S I", "SHIPPING INSTRUCTION"):
            return "SI"
        if n in ("BL", "B L", "BILL OF LADING"):
            return "BL"

    for pattern, kind in _MARKERS:
        if re.search(pattern, head):
            return kind

    # Fallback that survives a regenerate: a decoy is missing most of the seven
    # fields (a Packing List has no ports and no vessel at all). Deliberately
    # NOT the `*** NOT AN SI OR BL ***` footer the sample decoys carry — that
    # is a generator artefact.
    if fields_found < _MIN_FIELDS_FOR_UNKNOWN:
        return "UNKNOWN"
    return "UNKNOWN"


DECOY_KINDS = ("COMMERCIAL_INVOICE", "PACKING_LIST", "CERTIFICATE_OF_ORIGIN")
