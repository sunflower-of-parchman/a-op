#!/usr/bin/env python3
import argparse
import json
from datetime import datetime
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


def clean(value):
    return str(value or "").replace("\u2013", "-").replace("\u2014", "-").replace("\u2011", "-")


def safe(value):
    return escape(clean(value))


def date_label(value):
    try:
        return datetime.fromisoformat(clean(value).replace("Z", "+00:00")).strftime("%B %d, %Y")
    except ValueError:
        return clean(value)


def money(amount_minor, currency):
    return f"{clean(currency).upper()} {int(amount_minor) / 100:,.2f}"


def render(payload, output_path):
    styles = getSampleStyleSheet()
    ink = colors.HexColor("#1f1e1a")
    muted = colors.HexColor("#696359")
    accent = colors.HexColor("#b9462a")
    paper = colors.HexColor("#f2eee6")

    title_style = ParagraphStyle(
        "LicenseTitle",
        parent=styles["Title"],
        fontName="Times-Roman",
        fontSize=22,
        leading=26,
        textColor=ink,
        spaceAfter=14,
    )
    eyebrow_style = ParagraphStyle(
        "Eyebrow",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        textColor=accent,
        uppercase=True,
        spaceAfter=8,
    )
    heading_style = ParagraphStyle(
        "Heading",
        parent=styles["Heading2"],
        fontName="Times-Roman",
        fontSize=14,
        leading=18,
        textColor=ink,
        spaceBefore=12,
        spaceAfter=6,
    )
    body_style = ParagraphStyle(
        "Body",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=9.5,
        leading=14,
        textColor=ink,
        spaceAfter=8,
    )
    small_style = ParagraphStyle(
        "Small",
        parent=body_style,
        fontSize=7.5,
        leading=11,
        textColor=muted,
    )

    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=LETTER,
        rightMargin=0.7 * inch,
        leftMargin=0.7 * inch,
        topMargin=0.65 * inch,
        bottomMargin=0.65 * inch,
        title=clean(payload.get("licenseTitle")),
        author=clean(payload.get("artistName")),
        subject="Issued music license",
    )

    option = payload.get("option") or {}
    licensee = payload.get("licensee") or {}
    track = payload.get("track") or {}
    general_terms = payload.get("generalTerms") or []
    media = ", ".join(clean(item) for item in option.get("allowedMedia") or [])
    attribution = option.get("attributionText") if option.get("attributionRequired") else "Not required"

    story = [
        Paragraph("ISSUED MUSIC LICENSE", eyebrow_style),
        Paragraph(safe(payload.get("licenseTitle")), title_style),
        Paragraph(safe(payload.get("introduction")), body_style),
        Spacer(1, 6),
    ]

    identity_rows = [
        ["License ID", clean(payload.get("licenseId"))],
        ["Issued", date_label(payload.get("issuedAt"))],
        ["Artist / licensor", clean(payload.get("artistName"))],
        ["Licensee", clean(licensee.get("name"))],
        ["Project", clean(licensee.get("projectTitle"))],
        ["Track", clean(track.get("title"))],
        ["Paid amount", money(payload.get("amountMinor"), payload.get("currency"))],
    ]
    identity_table = Table(identity_rows, colWidths=[1.45 * inch, 5.05 * inch], hAlign="LEFT")
    identity_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, -1), paper),
                ("TEXTCOLOR", (0, 0), (0, -1), muted),
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTNAME", (1, 0), (1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                ("LEADING", (0, 0), (-1, -1), 12),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#b9ad9d")),
                ("LEFTPADDING", (0, 0), (-1, -1), 7),
                ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.extend([identity_table, Spacer(1, 14)])

    use_rows = [
        ["Supported use", clean(option.get("label"))],
        ["Category", clean(option.get("usageCategory"))],
        ["Allowed media", media],
        ["Audience", clean(option.get("audienceLabel"))],
        ["Distribution", clean(option.get("distributionLabel"))],
        ["Term", f"{int(option.get('termMonths') or 0)} months"],
        ["Territory", clean(option.get("territory"))],
        ["Exclusivity", "Non-exclusive"],
        ["Attribution", clean(attribution)],
    ]
    use_table = Table(use_rows, colWidths=[1.45 * inch, 5.05 * inch], hAlign="LEFT", repeatRows=1)
    use_table.setStyle(
        TableStyle(
            [
                ("TEXTCOLOR", (0, 0), (0, -1), muted),
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTNAME", (1, 0), (1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                ("LEADING", (0, 0), (-1, -1), 12),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LINEBELOW", (0, 0), (-1, -1), 0.35, colors.HexColor("#b9ad9d")),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.extend(
        [
            Paragraph("Selected use", heading_style),
            Paragraph(safe(option.get("description")), body_style),
            use_table,
            Paragraph("Licensed project", heading_style),
            Paragraph(safe(licensee.get("projectDescription")), body_style),
            PageBreak(),
            Paragraph("TERMS AND DOCUMENT NOTICE", eyebrow_style),
            Paragraph("General terms", heading_style),
        ]
    )

    for index, term in enumerate(general_terms, start=1):
        story.append(
            KeepTogether(
                [
                    Paragraph(f"{index}. {safe(term.get('heading'))}", body_style),
                    Paragraph(safe(term.get("body")), body_style),
                ]
            )
        )

    story.extend(
        [
            Spacer(1, 8),
            Paragraph("Document notice", heading_style),
            Paragraph(safe(payload.get("disclaimer")), small_style),
            Spacer(1, 18),
            Paragraph(
                "This document records the exact artist-published terms selected before verified payment. "
                "Uses outside these terms require separate written approval.",
                small_style,
            ),
        ]
    )

    def page(canvas, document):
        canvas.saveState()
        canvas.setStrokeColor(colors.HexColor("#b9ad9d"))
        canvas.setLineWidth(0.4)
        canvas.line(document.leftMargin, 0.45 * inch, LETTER[0] - document.rightMargin, 0.45 * inch)
        canvas.setFillColor(muted)
        canvas.setFont("Helvetica", 7.5)
        canvas.drawString(
            document.leftMargin,
            0.25 * inch,
            clean(f"{payload.get('artistName')} - License {payload.get('licenseId')}"),
        )
        canvas.drawRightString(
            LETTER[0] - document.rightMargin,
            0.25 * inch,
            f"Page {canvas.getPageNumber()}",
        )
        canvas.restoreState()

    doc.build(story, onFirstPage=page, onLaterPages=page)


def main():
    parser = argparse.ArgumentParser(description="Render an immutable issued music license PDF.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    payload = json.loads(Path(args.input).read_text(encoding="utf-8"))
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    render(payload, output_path)


if __name__ == "__main__":
    main()
