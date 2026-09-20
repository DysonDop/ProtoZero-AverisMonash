"""Word reader.

Shape: one two-column table. The label cell is bilingual
(`Consignee (收货人)`); the value cell holds the name and the address separated
by newlines, so the value is line 0 of that cell and the rest is evidence.
"""

from __future__ import annotations

import io

import docx as python_docx

from parsers.common import HitBag
from pipeline.schemas import Locator


def read(data: bytes) -> tuple[HitBag, str, int | None]:
    document = python_docx.Document(io.BytesIO(data))
    bag = HitBag()
    lines: list[str] = [p.text for p in document.paragraphs if p.text.strip()]

    row_index = 0
    for table in document.tables:
        for row in table.rows:
            cells = [c.text for c in row.cells]
            if len(cells) < 2:
                continue
            label, blob = cells[0], cells[1]
            value = blob.split("\n")[0].strip()
            bag.add(
                label,
                value,
                evidence=blob.strip(),
                locator=Locator(line=row_index),
            )
            lines.append(f"{label.strip()}: {blob.strip()}")
            row_index += 1

    return bag, "\n".join(lines), None
