"""The four normalisers. Exactly four — nothing else is normalised.

Every aggressive normalisation is a missed defect. The injected defects in this
corpus are near-miss entity swaps (`APRIL FINE PAPER TRADING` vs
`APRIL FINE PAPER TRADING (MIDDLE EAST) FZE`) and city rewrites that keep the
original UN/LOCODE. Suffix-stripping and code-comparison both collapse real
defects into false matches, so neither is done here.

Each function is pure and unit-tested with its trap case.
"""

from __future__ import annotations

import re
import unicodedata

_WS = re.compile(r"\s+")
_LOCODE_TAIL = re.compile(r"\s*\(\s*[A-Z]{5}\s*\)\s*$")
_PUNCT = re.compile(r"[.,;:'\"`‘’“”]")

# A value is blank when it is empty, whitespace, or one of the dataset's
# placeholder forms. A blank is UNCERTAINTY, never a discrepancy — it must
# never produce a MISMATCH.
_BLANK_TOKENS = {"n/a", "na", "n.a.", "tba", "tbd", "???", "?", "-", "--", "nil", "none"}
_UNDERSCORE_RUN = re.compile(r"^_{2,}$")
_QUESTION_RUN = re.compile(r"^\?{2,}$")
_DOT_RUN = re.compile(r"^\.{3,}$")


def is_blank(raw: object) -> bool:
    if raw is None:
        return True
    s = str(raw).strip()
    if not s:
        return True
    low = s.lower().strip()
    if low in _BLANK_TOKENS:
        return True
    if _UNDERSCORE_RUN.match(s) or _QUESTION_RUN.match(s) or _DOT_RUN.match(s):
        return True
    # '_______ MTS' style: strip trailing unit words, then re-test the stem.
    stem = re.sub(r"\s*(MTS|MT|KGS?|LBS?)\s*$", "", s, flags=re.I).strip()
    if stem != s and (not stem or _UNDERSCORE_RUN.match(stem) or _QUESTION_RUN.match(stem)):
        return True
    return False


def norm_weight(raw: object) -> int | None:
    """'131,058 KG' | '243,588' | 341715 -> 131058 | 243588 | 341715

    Strip every non-digit and parse an int. No unit conversion: MT, tonnes and
    LBS do not occur as a gross-weight unit anywhere in the corpus, and a
    converter that fires on a unit that isn't there is a source of false
    mismatches. If the final round introduces one, this is the single hook.
    """
    if is_blank(raw):
        return None
    digits = re.sub(r"\D", "", str(raw))
    if not digits:
        return None
    try:
        return int(digits)
    except ValueError:
        return None


def norm_party(raw: object) -> str | None:
    """Name only. Casefold, collapse whitespace, strip punctuation.

    DOES NOT strip legal suffixes (Sdn Bhd, Pte Ltd, FZE, ...). The injected
    shipper defects are exactly suffix-level entity swaps — stripping them
    merges a real defect into a match.
    """
    if is_blank(raw):
        return None
    s = str(raw)
    # Name is the first line / first segment; addresses live on the lines below
    # (txt, pdf), after a newline (docx) or in the next cell (xlsx).
    s = s.split("\n")[0]
    s = s.split(" | ")[0]
    s = unicodedata.normalize("NFKC", s)
    s = _PUNCT.sub(" ", s)
    s = _WS.sub(" ", s).strip().casefold()
    return s or None


def norm_port(raw: object) -> str | None:
    """Strip a trailing '(XXXXX)' UN/LOCODE, then casefold + collapse.

    THE CODE IS NEVER THE COMPARISON KEY. When the generator injects a port
    mismatch it rewrites the city and leaves the original code in place, so
    comparing codes scores zero on every port defect — the largest defect class
    in the corpus.

    'PORT KLANG (WESTPORT), MALAYSIA (MYPKG)' -> 'port klang (westport), malaysia'
    — only a trailing 5-letter uppercase bracket is removed, so the city's own
    parenthetical survives.
    """
    if is_blank(raw):
        return None
    s = str(raw).split("\n")[0]
    s = unicodedata.normalize("NFKC", s).strip()
    s = _LOCODE_TAIL.sub("", s)
    s = _WS.sub(" ", s).strip().casefold()
    s = s.rstrip(".,;").strip()
    return s or None


def norm_containers(raw: object) -> int | None:
    """"6 x 40'HC" -> 6.

    One format exists in the corpus: `<int> x <size>`. Word numbers, zero
    padding, mixed lines and cartons do not occur. Kept as the single hook if
    the final round adds grammar.
    """
    if is_blank(raw):
        return None
    s = str(raw).strip()
    m = re.match(r"\s*(\d+)\s*[xX×]", s)
    if m:
        return int(m.group(1))
    # A bare integer is a legitimate container count.
    if re.fullmatch(r"\d+", s):
        return int(s)
    # Leading integer followed by anything else — last resort, still deterministic.
    m = re.match(r"\s*(\d+)\b", s)
    return int(m.group(1)) if m else None


NORMALISERS = {
    "shipper": norm_party,
    "consignee": norm_party,
    "notify_party": norm_party,
    "port_of_loading": norm_port,
    "port_of_discharge": norm_port,
    "container_count": norm_containers,
    "gross_weight_kg": norm_weight,
}


def normalise(field: str, raw: object) -> object | None:
    return NORMALISERS[field](raw)
