"""Cross-check signals. These feed CONFIDENCE and never the verdict.

A cross-check that disagrees means "look at this", not "this is wrong". Letting
one decide a verdict would put a heuristic in the one place the design keeps
deterministic.
"""

from __future__ import annotations

import re

from pipeline.normalize import norm_containers, norm_weight

_ROW_WEIGHT = re.compile(r"^\s*([\d]{1,3}(?:,\d{3})+|\d{4,7})\s*$")
_CONTAINER_NUMBER = re.compile(r"^[A-Z]{3,4}\d{6,7}$")


def pdf_cross_checks(full_text: str, stated_count, stated_weight) -> dict[str, float]:
    """Do the container rows agree with the stated totals?

    1.0  rows corroborate the stated value
    0.5  not applicable (no row table)
    0.2  rows contradict it — worth a human look, not a verdict
    """
    out: dict[str, float] = {}
    if not full_text:
        return out

    lines = [ln.strip() for ln in full_text.splitlines()]
    numbers = [ln for ln in lines if _CONTAINER_NUMBER.match(ln)]
    row_weights = [
        norm_weight(ln)
        for ln in lines
        if _ROW_WEIGHT.match(ln) and norm_weight(ln) and norm_weight(ln) >= 1000
    ]

    count = norm_containers(stated_count)
    if numbers and count:
        out["container_count"] = 1.0 if len(numbers) == count else 0.2

    total = norm_weight(stated_weight)
    if total and len(row_weights) >= 2:
        # The totals line itself is usually in this list; drop the largest
        # value when it equals the stated total before summing the rest.
        rows = sorted(row_weights)
        if rows and rows[-1] == total:
            rows = rows[:-1]
        if rows and sum(rows) == total:
            out["gross_weight_kg"] = 1.0
        elif rows:
            out["gross_weight_kg"] = 0.2
    return out
