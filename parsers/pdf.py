"""PDF reader (digital text layer).

Returns `None` for text when the document is image-only, which routes the
document to OCR / Document Intelligence rather than to an `unreadable`
escalation. A PDF that PyMuPDF cannot open at all IS unreadable.
"""

from __future__ import annotations

import io

import fitz  # PyMuPDF

from parsers.common import HitBag
from parsers.linescan import scan


class UnreadablePDF(Exception):
    pass


class ImageOnlyPDF(Exception):
    """Opened fine, carries no text layer. OCR territory, not a failure."""

    def __init__(self, page_count: int) -> None:
        super().__init__("image-only pdf")
        self.page_count = page_count


def read(data: bytes) -> tuple[HitBag, str, int | None]:
    try:
        doc = fitz.open(stream=io.BytesIO(data), filetype="pdf")
    except Exception as exc:  # FileDataError on the truncated samples
        raise UnreadablePDF(str(exc)) from exc

    with doc:
        page_count = doc.page_count
        chunks: list[str] = []
        page_of_line: dict[int, int] = {}
        line_no = 0
        has_images = False
        for pno in range(page_count):
            page = doc[pno]
            text = page.get_text() or ""
            if not text.strip() and page.get_images():
                has_images = True
            for ln in text.splitlines():
                page_of_line[line_no] = pno + 1
                line_no += 1
                chunks.append(ln)
        full_text = "\n".join(chunks)

    if not full_text.strip():
        if has_images:
            raise ImageOnlyPDF(page_count)
        raise UnreadablePDF("no text and no images")

    bag = scan(full_text, allow_block=True, allow_glued=True, page_of_line=page_of_line)
    return bag, full_text, page_count
