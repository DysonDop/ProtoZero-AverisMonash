"""Line-oriented reader, shared by the .txt and .pdf paths.

Three shapes occur, sometimes in the same document:

    inline   `Container Count: 2 x 40'HC`
    block    `POL`                        (label alone, value on the next line)
             `PORT KLANG (WESTPORT), MALAYSIA`
    glued    `Consignee (Non-Negotiable) TOPKOPY MIDDLE EAST FZE`

Parties span several lines with the name first; only the name line becomes the
value, and the address lines become evidence. Comparing name+address blobs would
hide the generator's own tell — when a party is swapped the address underneath
is left unchanged.
"""

from __future__ import annotations

from pipeline.labels import resolve
from pipeline.schemas import Locator
from parsers.common import HitBag, split_label_value

_MAX_ADDRESS_LINES = 4


def _is_exact_label(line: str) -> bool:
    """A line that IS a label, not a line that merely starts with one.

    The distinction is load-bearing: `Consignee (Non-Negotiable) TOPKOPY
    MIDDLE EAST FZE` starts with a label but carries its own value, so treating
    it as a bare label consumes the next line — an address — as the consignee.
    """
    field, directness = resolve(line.strip())
    return field is not None and directness >= 1.0


def _looks_like_label(line: str) -> bool:
    field, _ = resolve(line.strip())
    return field is not None


def _glued_split(line: str) -> tuple[str, str] | None:
    """Longest prefix of `line` that resolves to a field, with a non-empty rest."""
    tokens = line.split()
    best: tuple[str, str] | None = None
    for cut in range(1, min(len(tokens), 8)):
        prefix = " ".join(tokens[:cut])
        rest = " ".join(tokens[cut:]).strip()
        if not rest:
            continue
        field, directness = resolve(prefix)
        # Exact hits only. A containment hit here would let the prefix eat the
        # first words of the value ('Consignee (Non-Negotiable) TOPKOPY').
        if field is not None and directness >= 1.0:
            best = (prefix, rest)  # keep going: prefer the longest exact match
    return best


def scan(
    text: str,
    *,
    allow_block: bool = True,
    allow_glued: bool = True,
    page_of_line: dict[int, int] | None = None,
) -> HitBag:
    bag = HitBag()
    lines = text.splitlines()
    offsets: list[int] = []
    pos = 0
    for ln in lines:
        offsets.append(pos)
        pos += len(ln) + 1

    for i, raw_line in enumerate(lines):
        line = raw_line.strip()
        if not line:
            continue

        locator = Locator(
            line=i,
            char_start=offsets[i],
            char_end=offsets[i] + len(raw_line),
            page=(page_of_line or {}).get(i),
        )

        # -- inline -------------------------------------------------------
        pair = split_label_value(line)
        if pair is not None:
            label, value = pair
            if resolve(label)[0] is not None:
                evidence = _with_address(lines, i, value)
                bag.add(label, value, evidence=evidence, locator=locator)
                continue

        # -- glued --------------------------------------------------------
        # Tried before the block form: a line that carries both a label and a
        # value must be read as such, not as a lone label.
        if allow_glued and not _is_exact_label(line):
            glued = _glued_split(line)
            if glued is not None:
                label, value = glued
                evidence = _with_address(lines, i, value)
                if bag.add(label, value, evidence=evidence, locator=locator):
                    continue

        # -- block --------------------------------------------------------
        if allow_block and _is_exact_label(line):
            nxt = _next_nonblank(lines, i + 1)
            if nxt is not None and not _looks_like_label(lines[nxt]):
                value = lines[nxt].strip()
                evidence = _with_address(lines, nxt, value)
                bag.add(line, value, evidence=evidence, locator=locator)

    return bag


def _next_nonblank(lines: list[str], start: int) -> int | None:
    for j in range(start, min(start + 3, len(lines))):
        if lines[j].strip():
            return j
    return None


def _with_address(lines: list[str], idx: int, value: str) -> str:
    """Evidence = the value line plus any indented continuation lines.

    The address never enters the compared value; it is kept so a reviewer sees
    the whole party block, and so a name/address inconsistency is visible.
    """
    out = [value]
    for j in range(idx + 1, min(idx + 1 + _MAX_ADDRESS_LINES, len(lines))):
        nxt = lines[j]
        if not nxt.strip():
            break
        if nxt[:1] not in (" ", "\t"):
            break
        if _looks_like_label(nxt):
            break
        out.append(nxt.strip())
    return "\n".join(out)
