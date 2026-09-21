from pipeline.classify import classify, strip_banner

BANNER = (
    "WARNING: This email originated outside of our organisation. "
    "Do not click links or open attachments unless you recognise the sender.\n\n"
)


def test_banner_is_stripped_before_any_body_heuristic():
    body = BANNER + "Hi, please assist to send the draft BL."
    assert "attachment" not in strip_banner(body).lower()


def test_spam_is_decided_on_sender_domain_alone():
    cat, by, _ = classify("You have won", "click here", "x@prize-claims.info", 0)
    assert cat == "SPAM" and by == "rule"


def test_comparison_and_si_request_share_a_shape_but_not_a_category():
    cat, _, _ = classify(
        "AIE - MOMBASA - MSC(MEDUUD104332) - CHECK", "", "docs@aprilasia.com", 2
    )
    assert cat == "BL_COMPARISON"
    cat, _, _ = classify(
        "SI - SIN832764835 - DIRECT(ONE) - PAPER", "", "docs@aprilasia.com", 0
    )
    assert cat == "SI_REQUEST"


def test_bot_notice_with_billing_in_it_is_general_not_invoice():
    cat, _, _ = classify(
        "_RPA_ India HSS SD Billing Process Completed", "", "rpa.bot@aprilasia.com", 0
    )
    assert cat == "GENERAL"


def test_reminder_mentioning_si_is_general():
    cat, _, _ = classify(
        "_Reminder_Paper - Submit SI & AED_26-01-2026", "", "hr@april.com.my", 0
    )
    assert cat == "GENERAL"


def test_underscore_separator_does_not_defeat_the_si_rule():
    cat, by, _ = classify(
        "RE_ SI NEEDED_ 5APH-26773 _ UAB NOVAKOPA _ PO_25_2186 _ MERSIN",
        "",
        "docs@aprilasia.com",
        0,
    )
    assert cat == "SI_REQUEST" and by == "rule"


def test_si_rule_still_rejects_a_longer_word():
    cat, _, _ = classify(
        "NEW SIGNATURE REQUIRED FOR PO_25_2186", "", "docs@aprilasia.com", 0
    )
    assert cat != "SI_REQUEST"
