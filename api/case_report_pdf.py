"""Render a self-contained, downloadable case report."""

from __future__ import annotations

from datetime import datetime, timezone
from html import escape
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from pipeline.schemas import AuditEvent, Case, CaseDecision, FieldComparison


INK = colors.HexColor("#101A24")
MUTED = colors.HexColor("#55606B")
RULE = colors.HexColor("#D9DCE0")
PAPER = colors.HexColor("#F5F2EC")
ORANGE = colors.HexColor("#D88C3D")
BLUE = colors.HexColor("#006DAE")
WRONG = colors.HexColor("#B83A28")
CLEAR = colors.HexColor("#1F6252")

FIELD_LABELS = {
    "shipper": "Shipper",
    "consignee": "Consignee",
    "notify_party": "Notify party",
    "port_of_loading": "Port of loading",
    "port_of_discharge": "Port of discharge",
    "container_count": "Container count",
    "gross_weight_kg": "Gross weight (KG)",
}

REASON_LABELS = {
    "wrong_doc_type": "Wrong document attached",
    "missing_attachment": "Missing attachment",
    "unreadable": "Unreadable document",
    "missing_value": "A required value is blank",
}


def build_case_report_pdf(
    case: Case,
    events: list[AuditEvent],
    decision: CaseDecision | None = None,
    *,
    generated_at: datetime | None = None,
) -> bytes:
    """Return a polished PDF containing the current case state and evidence."""
    generated_at = generated_at or datetime.now(timezone.utc)
    stream = BytesIO()
    doc = SimpleDocTemplate(
        stream,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=17 * mm,
        bottomMargin=17 * mm,
        title=f"Case report - {case.email_id}",
        author="ProtoZero",
        subject="Shipping document verification case report",
    )
    styles = _styles()
    story = []

    story.append(_report_header(case, decision, generated_at, styles))
    story.append(Spacer(1, 7 * mm))
    story.append(Paragraph("Decision summary", styles["section"]))
    story.append(Spacer(1, 2.5 * mm))
    story.append(_summary_table(case, events, decision, styles))
    story.append(Spacer(1, 7 * mm))

    story.append(Paragraph("Field comparison", styles["section"]))
    story.append(Paragraph(
        "Values and scores below are the values recorded by the comparison pipeline. "
        "Human corrections remain visible in the audit trail.",
        styles["caption"],
    ))
    story.append(Spacer(1, 2.5 * mm))
    story.append(_comparison_table(case, styles))

    if events:
        story.append(PageBreak())
        story.append(Paragraph("Audit trail", styles["section"]))
        story.append(Paragraph(
            f"{len(events)} recorded event{'s' if len(events) != 1 else ''} for correlation ID "
            f"{_safe(case.correlation_id)}.",
            styles["caption"],
        ))
        story.append(Spacer(1, 2.5 * mm))
        story.append(_audit_table(events, styles))

    doc.build(
        story,
        onFirstPage=lambda canvas, current: _page_footer(canvas, current, case.email_id),
        onLaterPages=lambda canvas, current: _page_footer(canvas, current, case.email_id),
    )
    return stream.getvalue()


def _styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "brand": ParagraphStyle(
            "Brand", parent=base["Normal"], fontName="Helvetica-Bold",
            fontSize=13, leading=15, textColor=INK,
        ),
        "eyebrow": ParagraphStyle(
            "Eyebrow", parent=base["Normal"], fontName="Helvetica-Bold",
            fontSize=7, leading=9, tracking=1.5, textColor=MUTED,
        ),
        "title": ParagraphStyle(
            "Title", parent=base["Normal"], fontName="Helvetica-Bold",
            fontSize=19, leading=23, textColor=INK,
        ),
        "section": ParagraphStyle(
            "Section", parent=base["Heading2"], fontName="Helvetica-Bold",
            fontSize=12, leading=15, textColor=INK, spaceAfter=0,
        ),
        "body": ParagraphStyle(
            "Body", parent=base["Normal"], fontName="Helvetica",
            fontSize=8.5, leading=11.5, textColor=INK,
        ),
        "body_mono": ParagraphStyle(
            "BodyMono", parent=base["Normal"], fontName="Courier",
            fontSize=7.5, leading=10, textColor=INK,
        ),
        "caption": ParagraphStyle(
            "Caption", parent=base["Normal"], fontName="Helvetica",
            fontSize=7.5, leading=10, textColor=MUTED,
        ),
        "label": ParagraphStyle(
            "Label", parent=base["Normal"], fontName="Helvetica-Bold",
            fontSize=6.5, leading=8, tracking=.7, textColor=MUTED,
        ),
        "right_caption": ParagraphStyle(
            "RightCaption", parent=base["Normal"], fontName="Helvetica",
            fontSize=7.5, leading=10, textColor=MUTED, alignment=TA_RIGHT,
        ),
        "table_head": ParagraphStyle(
            "TableHead", parent=base["Normal"], fontName="Helvetica-Bold",
            fontSize=6.5, leading=8, textColor=colors.white,
        ),
        "table_body": ParagraphStyle(
            "TableBody", parent=base["Normal"], fontName="Helvetica",
            fontSize=7, leading=9.5, textColor=INK,
        ),
        "table_mono": ParagraphStyle(
            "TableMono", parent=base["Normal"], fontName="Courier",
            fontSize=6.6, leading=9, textColor=INK,
        ),
    }


def _report_header(case: Case, decision: CaseDecision | None, generated_at: datetime, styles) -> Table:
    result, tone = _result(case, decision)
    left = [
        Paragraph("PROTOZERO", styles["brand"]),
        Paragraph("CASE REPORT", styles["eyebrow"]),
        Spacer(1, 2 * mm),
        Paragraph(_safe(case.subject or "Decision summary"), styles["title"]),
        Paragraph(f"Generated {_format_timestamp(generated_at)}", styles["caption"]),
    ]
    status = Table(
        [[Paragraph(_safe(result), styles["table_head"])]],
        colWidths=[38 * mm],
        style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), tone),
            ("BOX", (0, 0), (-1, -1), .6, tone),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]),
    )
    return Table(
        [[left, status]],
        colWidths=[128 * mm, 38 * mm],
        style=TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("ALIGN", (1, 0), (1, 0), "RIGHT"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ]),
    )


def _summary_table(case: Case, events: list[AuditEvent], decision: CaseDecision | None, styles) -> Table:
    comparisons = case.comparisons
    complete_pairs = sum(1 for item in comparisons if _has_value(item.si.value) and _has_value(item.bl.value))
    confidence_scores = [item.confidence.score for item in comparisons if item.confidence is not None]
    average_confidence = (
        f"{round(sum(confidence_scores) / len(confidence_scores) * 100)}%"
        if confidence_scores else "Not recorded"
    )
    correction_count = sum(1 for event in events if event.action == "HUMAN_CORRECTION")
    documents = ", ".join(
        f"{document.role} ({'readable' if document.readable else 'unreadable'})"
        for document in case.documents
    ) or "None"
    issue_text = _issue_summary(case)
    decision_text = decision.label if decision else "Not recorded"
    facts = [
        ("CASE ID", case.email_id),
        ("CORRELATION ID", case.correlation_id),
        ("STATUS", case.lifecycle.upper()),
        ("REVIEWER DECISION", decision_text),
        ("DOCUMENTS", documents),
        ("ISSUES", issue_text),
        ("FIELD EXTRACTION", f"{complete_pairs}/{len(comparisons)} field pairs" if comparisons else "Not run"),
        ("AVERAGE FIELD CONFIDENCE", average_confidence),
        ("HUMAN CORRECTIONS", str(correction_count)),
        ("AUDIT EVENTS", str(len(events))),
    ]
    rows = []
    for index in range(0, len(facts), 2):
        rows.append([_fact_cell(*facts[index], styles), _fact_cell(*facts[index + 1], styles)])
    return Table(
        rows,
        colWidths=[83 * mm, 83 * mm],
        style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.white),
            ("GRID", (0, 0), (-1, -1), .45, RULE),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ]),
    )


def _fact_cell(label: str, value: str, styles) -> list:
    return [
        Paragraph(_safe(label), styles["label"]),
        Spacer(1, 1.2 * mm),
        Paragraph(_safe(value), styles["body"]),
    ]


def _comparison_table(case: Case, styles) -> Table:
    headers = ["FIELD", "INSTRUCTION", "DRAFT", "SIMILARITY", "CONFIDENCE", "RESULT / EVIDENCE"]
    rows = [[Paragraph(value, styles["table_head"]) for value in headers]]
    for comparison in case.comparisons:
        rows.append([
            Paragraph(_safe(FIELD_LABELS.get(comparison.field, comparison.field)), styles["table_body"]),
            Paragraph(_safe(comparison.si.value or "Not recorded"), styles["table_mono"]),
            Paragraph(_safe(comparison.bl.value or "Not recorded"), styles["table_mono"]),
            Paragraph(_percent(comparison.similarity, already_percent=True), styles["table_mono"]),
            Paragraph(_percent(comparison.confidence.score), styles["table_mono"]),
            Paragraph(
                f"{_safe(_comparison_result(comparison))}<br/><font color='#55606B'>"
                f"{_safe(_evidence_location(comparison))}</font>",
                styles["table_body"],
            ),
        ])
    if len(rows) == 1:
        rows.append([Paragraph("No field comparison was recorded.", styles["table_body"])] + [""] * 5)
    table = Table(rows, colWidths=[24 * mm, 38 * mm, 38 * mm, 18 * mm, 20 * mm, 28 * mm], repeatRows=1)
    commands = [
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("GRID", (0, 0), (-1, -1), .4, RULE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    for row_number, comparison in enumerate(case.comparisons, start=1):
        if comparison.verdict == "MISMATCH":
            commands.append(("BACKGROUND", (0, row_number), (-1, row_number), colors.HexColor("#FFF5F2")))
        elif comparison.verdict in {"REVIEW", "ABSENT"} or comparison.confidence.hard_fail:
            commands.append(("BACKGROUND", (0, row_number), (-1, row_number), colors.HexColor("#F2F8FC")))
    table.setStyle(TableStyle(commands))
    return table


def _audit_table(events: list[AuditEvent], styles) -> Table:
    headers = ["#", "TIMESTAMP (UTC)", "ACTOR", "ACTION", "DETAILS"]
    rows = [[Paragraph(value, styles["table_head"]) for value in headers]]
    for event in events:
        details = []
        if event.field:
            details.append(f"Field: {FIELD_LABELS.get(event.field, event.field)}")
        if event.previous_value is not None or event.new_value is not None:
            details.append(f"Change: {event.previous_value or 'blank'} -> {event.new_value or 'blank'}")
        if event.reason:
            details.append(event.reason)
        rows.append([
            Paragraph(str(event.seq), styles["table_mono"]),
            Paragraph(_format_timestamp(event.at), styles["table_mono"]),
            Paragraph(_safe(event.reviewer_id or event.actor), styles["table_body"]),
            Paragraph(_safe(event.action.replace("_", " ")), styles["table_mono"]),
            Paragraph(_safe(" | ".join(details) or "Recorded"), styles["table_body"]),
        ])
    return Table(
        rows,
        colWidths=[9 * mm, 31 * mm, 24 * mm, 39 * mm, 63 * mm],
        repeatRows=1,
        style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), INK),
            ("GRID", (0, 0), (-1, -1), .4, RULE),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, PAPER]),
        ]),
    )


def _result(case: Case, decision: CaseDecision | None) -> tuple[str, colors.Color]:
    if decision:
        tones = {"approve": CLEAR, "reject": WRONG, "review": BLUE, "request": ORANGE}
        return decision.label.upper(), tones.get(decision.action, INK)
    if case.category != "BL_COMPARISON":
        return "NOT A CHECK", MUTED
    if case.status == "MISMATCH":
        return "MISMATCH", WRONG
    if case.status == "NEEDS_REVIEW":
        return "REVIEW REQUIRED", BLUE
    return ("MATCH" if case.comparisons else "NOT COMPARED"), CLEAR


def _issue_summary(case: Case) -> str:
    issues = []
    for comparison in case.comparisons:
        label = FIELD_LABELS.get(comparison.field, comparison.field)
        if comparison.human_reviewed and comparison.verdict == "MATCH":
            issues.append(f"{label} corrected")
        elif comparison.verdict == "MISMATCH":
            issues.append(f"{label} mismatch")
        elif comparison.verdict != "MATCH" or comparison.confidence.hard_fail:
            issues.append(f"{label} requires review")
    if issues:
        return ", ".join(issues)
    if case.wire_review_reason:
        return REASON_LABELS.get(case.wire_review_reason, case.wire_review_reason.replace("_", " ").title())
    return "None"


def _comparison_result(comparison: FieldComparison) -> str:
    if comparison.human_reviewed and comparison.verdict == "MATCH":
        return "Corrected - match"
    return comparison.verdict.replace("_", " ").title()


def _evidence_location(comparison: FieldComparison) -> str:
    return f"SI {_locator(comparison.si.locator)} / BL {_locator(comparison.bl.locator)}"


def _locator(locator) -> str:
    if locator is None:
        return "location unavailable"
    if locator.page is not None:
        return f"page {locator.page}"
    if locator.sheet:
        return f"{locator.sheet}, row {locator.line if locator.line is not None else '-'}"
    if locator.line is not None:
        return f"line {locator.line + 1}"
    return "location unavailable"


def _page_footer(canvas, doc, email_id: str) -> None:
    canvas.saveState()
    canvas.setStrokeColor(RULE)
    canvas.setLineWidth(.5)
    canvas.line(doc.leftMargin, 12 * mm, A4[0] - doc.rightMargin, 12 * mm)
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(MUTED)
    canvas.drawString(doc.leftMargin, 8 * mm, f"ProtoZero case report - {email_id}")
    canvas.drawRightString(A4[0] - doc.rightMargin, 8 * mm, f"Page {doc.page}")
    canvas.restoreState()


def _format_timestamp(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _percent(value: float | None, *, already_percent: bool = False) -> str:
    if value is None:
        return "Not recorded"
    return f"{round(value if already_percent else value * 100)}%"


def _has_value(value: str | None) -> bool:
    return value is not None and bool(str(value).strip())


def _safe(value: object) -> str:
    text = str(value).translate(str.maketrans({
        "\u2011": "-",
        "\u2013": "-",
        "\u2014": "-",
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u00a0": " ",
    }))
    return escape(text, quote=False)
