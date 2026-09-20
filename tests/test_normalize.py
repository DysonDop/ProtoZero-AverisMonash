"""Every normalisation rule, with its trap case. The trap is the point."""

from pipeline.normalize import is_blank, norm_containers, norm_party, norm_port, norm_weight


def test_weight_formats_across_all_four_renderers():
    assert norm_weight("131,058 KG") == 131058   # txt
    assert norm_weight("243,588") == 243588      # docx, no unit
    assert norm_weight(341715) == 341715         # xlsx, bare int
    assert norm_weight("TOTAL 41,326 KG") == 41326


def test_weight_blank_forms_are_none_not_zero():
    # A blank is uncertainty. Returning 0 would make it a discrepancy.
    for blank in ("", "   ", "N/A", "???", "_______", "_______ MTS", None):
        assert norm_weight(blank) is None


def test_port_strips_locode_but_keeps_the_citys_own_bracket():
    # TRAP: injected port defects rewrite the city and LEAVE THE CODE. Comparing
    # codes scores zero on every one of them.
    assert norm_port("MOMBASA, KENYA (KEMBA)") != norm_port("TUTICORIN, INDIA (KEMBA)")
    assert norm_port("SINGAPORE (SGSIN)") == norm_port("SINGAPORE")
    assert norm_port("PORT KLANG (WESTPORT), MALAYSIA (MYPKG)") == "port klang (westport), malaysia"


def test_party_does_not_strip_legal_suffixes():
    # TRAP: the injected shipper defects ARE suffix-level entity swaps.
    a = norm_party("APRIL FINE PAPER TRADING")
    b = norm_party("APRIL FINE PAPER TRADING (MIDDLE EAST) FZE")
    c = norm_party("APRIL FAR EAST (M) SDN BHD")
    assert a != b and b != c and a != c


def test_party_takes_the_name_not_the_address():
    assert norm_party("ROXCEL TRADING GMBH\nOPERNRING 3-5; 1010 VIENNA") == "roxcel trading gmbh"
    assert norm_party("ROXCEL TRADING GMBH | OPERNRING 3-5") == "roxcel trading gmbh"


def test_containers():
    assert norm_containers("6 x 40'HC") == 6
    assert norm_containers("15 x 20'GP") == 15
    assert norm_containers("3") == 3
    assert norm_containers("") is None


def test_blank_detection():
    assert is_blank("N/A") and is_blank("???") and is_blank("_______ MTS")
    assert not is_blank("0") and not is_blank("SINGAPORE")
