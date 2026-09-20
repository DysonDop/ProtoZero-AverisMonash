"""Excel reader.

Shape: two or three columns — `label | name | address`. The sheet is named
`S.I.` or `BL`. Weight arrives as a bare integer with no separator and no unit,
which is the one place the weight normaliser has to do real work.
"""

from __future__ import annotations

import io

import openpyxl

from parsers.common import HitBag
from pipeline.schemas import Locator


def read(data: bytes) -> tuple[HitBag, str, int | None]:
    wb = openpyxl.load_workbook(io.BytesIO(data), data_only=True, read_only=True)
    bag = HitBag()
    lines: list[str] = []
    try:
        for ws in wb.worksheets:
            for r, row in enumerate(ws.iter_rows(values_only=True), start=1):
                cells = ["" if c is None else str(c).strip() for c in row]
                if not any(cells):
                    continue
                lines.append(" | ".join(c for c in cells if c))
                if len(cells) < 2 or not cells[0]:
                    continue
                label = cells[0]
                blob = cells[1]
                address = cells[2] if len(cells) > 2 else ""
                # Some workbooks put `NAME | ADDRESS` in one cell and some split
                # them across two. Either way the compared value is the name.
                value = blob.split(" | ")[0].strip()
                evidence = " | ".join(x for x in (blob, address) if x)
                bag.add(
                    label,
                    value,
                    evidence=evidence,
                    locator=Locator(sheet=ws.title, line=r),
                )
    finally:
        wb.close()
    return bag, "\n".join(lines), None
