"""Plain-text SI / BL reader.

Shape: `Label: value` per line, party address on the following indented lines.
No block or glued forms occur here, so both are disabled — enabling them would
only create opportunities to misread an address line as a label.
"""

from __future__ import annotations

from parsers.common import HitBag
from parsers.linescan import scan


def read(data: bytes) -> tuple[HitBag, str, int | None]:
    text = data.decode("utf-8", errors="replace")
    bag = scan(text, allow_block=False, allow_glued=False)
    return bag, text, None
