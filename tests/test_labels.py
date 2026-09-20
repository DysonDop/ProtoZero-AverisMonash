from pipeline.labels import normalise_label, resolve


def test_bilingual_and_parenthetical_labels_collapse():
    for raw in ("Gross Weight毛重(KGS)", "Gross Wt (kgs)", "GROSS WEIGHT", "Gross Weight (KG):"):
        assert resolve(raw)[0] == "gross_weight_kg", raw
    assert normalise_label("PORT OF LOADING (装货港)") == "port of loading"


def test_net_weight_is_never_a_weight():
    # TRAP: a planted decoy on every missing_value edge case.
    for raw in ("NET WEIGHT", "Net Wt (kg)", "NET WEIGHT: _______ MTS"):
        assert resolve(raw)[0] is None, raw


def test_total_outranks_the_bare_label():
    from pipeline.labels import is_total_label
    assert is_total_label("TOTAL Gross Weight (KG)")
    assert not is_total_label("GROSS WEIGHT (KG)")


def test_port_label_variants():
    for raw in ("POL", "Port of Loading", "Load Port", "PORT OF LOADING (装货港)"):
        assert resolve(raw)[0] == "port_of_loading", raw
    for raw in ("POD", "Port of Discharge", "Discharge Port"):
        assert resolve(raw)[0] == "port_of_discharge", raw


def test_consignee_label_that_looks_like_a_bearer_bl():
    # "To the Order of" is a LABEL here, always followed by a named company.
    assert resolve("To the Order of (收货人)")[0] == "consignee"
