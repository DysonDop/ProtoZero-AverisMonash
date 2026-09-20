"""Label resolution, shared by every parser.

One job: turn whatever a document calls a field into one of the seven canonical
field names, or nothing at all. A label that does not resolve is ignored — it is
never guessed at.
"""

from __future__ import annotations

import functools
import re
import unicodedata

import yaml

from pipeline.config import DATA_REFS

_PAREN = re.compile(r"[（(][^）)]*[）)]")
_CJK = re.compile(
    r"[⺀-鿿豈-﫿＀-￯]"
)  # CJK blocks + fullwidth forms
_WS = re.compile(r"\s+")


def normalise_label(raw: str | None) -> str:
    """'Gross Weight毛重(KGS):' -> 'gross weight'.

    Order matters: strip parentheticals before CJK, so 'PORT OF LOADING (装货港)'
    loses the whole bracket rather than leaving an empty '()' behind.
    """
    if not raw:
        return ""
    s = unicodedata.normalize("NFKC", str(raw))
    s = _PAREN.sub(" ", s)
    s = _CJK.sub(" ", s)
    s = s.replace("：", ":").strip()
    s = s.rstrip(":").strip()
    s = _WS.sub(" ", s)
    return s.lower().strip()


@functools.lru_cache(maxsize=1)
def _load() -> tuple[dict[str, str], frozenset[str]]:
    raw = yaml.safe_load((DATA_REFS / "synonyms.yaml").read_text(encoding="utf-8"))
    blacklist = frozenset(normalise_label(b) for b in raw.pop("blacklist", []))
    table: dict[str, str] = {}
    for field, labels in raw.items():
        for label in labels:
            table[normalise_label(label)] = field
    return table, blacklist


def resolve(raw_label: str | None) -> tuple[str | None, float]:
    """Return (field_name, label_directness) for a raw document label.

    label_directness feeds the confidence score:
      1.0  exact synonym hit
      0.6  a 'TOTAL <label>' variant, or a prefix/suffix containment hit
      0.0  no resolution (caller ignores the label)
    """
    norm = normalise_label(raw_label)
    if not norm:
        return None, 0.0

    table, blacklist = _load()

    # Blacklist wins over everything. 'NET WEIGHT' must never become a weight.
    for bad in blacklist:
        if bad and bad in norm:
            return None, 0.0

    if norm in table:
        return table[norm], 1.0

    # 'total gross weight' is in the table directly; this catches
    # 'total gross weight kgs' and friends without widening the map.
    if norm.startswith("total "):
        stripped = norm[len("total ") :]
        if stripped in table:
            return table[stripped], 1.0

    # Containment, longest key first — 'no. of containers or packages' should
    # beat 'containers'. Deliberately NOT fuzzy: a near-miss label is a synonym
    # map gap to be logged, not a guess to be made.
    for key in sorted(table, key=len, reverse=True):
        if len(key) >= 4 and (norm.startswith(key) or norm.endswith(key)):
            return table[key], 0.6

    return None, 0.0


def is_total_label(raw_label: str | None) -> bool:
    """A 'TOTAL ...' label outranks the same label without it.

    On PDFs, `GROSS WEIGHT (KG)` is a container-table COLUMN HEADER; the field
    is the line beginning `TOTAL`. Without this precedence a block parser
    returns a container number as the gross weight.
    """
    return normalise_label(raw_label).startswith("total")
