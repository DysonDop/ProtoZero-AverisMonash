from pipeline.compare import compare_documents
from pipeline.schemas import ExtractedField, ShipmentFields

BASE = dict(
    shipper="APRIL FINE PAPER TRADING",
    consignee="ROXCEL TRADING GMBH",
    notify_party="ROXCEL TRADING GMBH",
    port_of_loading="SINGAPORE (SGSIN)",
    port_of_discharge="MOMBASA, KENYA (KEMBA)",
    container_count="3 x 40'HC",
    gross_weight_kg="67,311 KG",
)


def fields(**overrides) -> ShipmentFields:
    data = {**BASE, **overrides}
    return ShipmentFields(
        **{k: ExtractedField(value=v, evidence=v, label_seen=k) for k, v in data.items()}
    )


def verdicts(si, bl, **kw):
    return {c.field: c.verdict for c in compare_documents(si, bl, si_fmt="txt", bl_fmt="txt", **kw)}


def test_identical_documents_report_no_mismatch():
    assert set(verdicts(fields(), fields()).values()) == {"MATCH"}


def test_port_defect_that_keeps_the_original_locode_is_caught():
    v = verdicts(fields(), fields(port_of_discharge="TUTICORIN, INDIA (KEMBA)"))
    assert v["port_of_discharge"] == "MISMATCH"


def test_cross_format_weight_and_port_do_not_produce_false_mismatches():
    v = verdicts(
        fields(),
        fields(gross_weight_kg="67311", port_of_loading="SINGAPORE"),
    )
    assert v["gross_weight_kg"] == "MATCH"
    assert v["port_of_loading"] == "MATCH"


def test_container_count_difference_is_the_only_field_flagged():
    comps = compare_documents(
        fields(), fields(container_count="4 x 40'HC"), si_fmt="txt", bl_fmt="txt"
    )
    assert [c.field for c in comps if c.verdict == "MISMATCH"] == ["container_count"]
    flagged = next(c for c in comps if c.field == "container_count")
    assert "SI: 3 x 40'HC" in flagged.explanation and "BL: 4 x 40'HC" in flagged.explanation


def test_blank_value_is_absent_never_a_mismatch():
    for blank in ("", "N/A", "???"):
        v = verdicts(fields(shipper=blank), fields())
        assert v["shipper"] == "ABSENT", blank


def test_entity_swap_is_a_mismatch_not_a_fuzzy_match():
    v = verdicts(fields(), fields(shipper="APRIL FINE PAPER TRADING (MIDDLE EAST) FZE"))
    assert v["shipper"] in ("MISMATCH", "REVIEW")
    assert v["shipper"] != "MATCH"
