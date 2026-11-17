"""
Fly Fishing Trials PDF Generator
================================
Generates high quality, printable tournament documents via ReportLab:
1. Tournament Schedule & Beat Allocations (The Master Draw Chart)
2. Live / Official Leaderboard & Standings
3. Printable Field Scorecards for competitors & marshals
"""

import os
from typing import Dict, Any, List
from reportlab.lib.pagesizes import letter, landscape, portrait
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch

def generate_tournament_pdf(state: Dict[str, Any], output_path: str) -> str:
    """
    Creates a comprehensive landscape PDF document for the tournament.
    """
    doc = SimpleDocTemplate(
        output_path,
        pagesize=landscape(letter),
        leftMargin=0.4 * inch,
        rightMargin=0.4 * inch,
        topMargin=0.4 * inch,
        bottomMargin=0.4 * inch
    )
    
    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=24,
        textColor=colors.HexColor('#064e3b'), # Forest Green
        alignment=1 # Center
    )
    
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#475569'),
        alignment=1
    )
    
    h2_style = ParagraphStyle(
        'SectionH2',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=17,
        textColor=colors.HexColor('#0f172a'),
        spaceBefore=10,
        spaceAfter=6
    )
    
    cell_style = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=11
    )
    
    cell_bold = ParagraphStyle(
        'TableCellBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor('#064e3b')
    )

    cell_header = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=12,
        textColor=colors.white,
        alignment=1
    )

    elements = []
    
    # 1. Header Banner
    t_name = state.get("tournament_name", "Fly Fishing Trials")
    venue = state.get("venue", "Championship Beats")
    elements.append(Paragraph(t_name, title_style))
    elements.append(Paragraph(f"Venue: {venue} &bull; Official Schedule & Score Sheet &bull; 4 Sessions (Sat AM, Sat PM, Sun AM, Sun PM)", subtitle_style))
    elements.append(Spacer(1, 10))
    
    # Rules summary pill
    a_team_set = set(state.get("a_team_anglers", []))
    a_team_rule_text = ""
    if a_team_set:
        a_team_rule_text = (
            f"<br/><b>A-Team Constraints ({len(a_team_set)} seeded anglers [A]):</b> "
            "A-Team members face fellow A-Team members in 2 matches and challengers in 2 matches. "
            "All non-A-team challengers face at least one A-Team member."
        )

    rules_text = (
        "<b>Scoring Rules:</b> 1v1 matches: 10.0 pts pool &bull; 3-Way (1v1v1) matches: 15.0 pts pool, capped at 10.0 max pts per angler. "
        "Points = min(10.0, Pool / Total Fish &times; Angler Fish). Blank (0 fish) = 0.00 pts. Total tournament score is the sum across all 4 sessions.<br/>"
        "<b>Beat & River Movement:</b> Day 1 (S1 &rarr; S2): 1 angler stays on beat, 1 moves. Day 2 (S3 &rarr; S4): Day 1 mover stays on beat, Day 1 stayer moves. "
        "Competitors fish across both Small Brook (Smalblaar) &amp; Yellands Part (Elandspad) beats."
        f"{a_team_rule_text}"
    )
    rules_table = Table(
        [[Paragraph(rules_text, ParagraphStyle('Rules', parent=styles['Normal'], fontSize=8, leading=11, textColor=colors.HexColor('#1e3a8a')))]],
        colWidths=[10.2 * inch]
    )
    rules_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#eff6ff')),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#93c5fd')),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(rules_table)
    elements.append(Spacer(1, 12))
    
    # 2. Section: Master Draw / Schedule Chart
    elements.append(Paragraph("1. Tournament Schedule & Beat Allocations (The Draw Chart)", h2_style))
    
    sessions = state.get("sessions", [])
    num_beats = state.get("num_beats", 4)
    num_anglers = state.get("num_anglers", len(state.get("anglers", [])))
    
    # Adaptive cell sizing based on number of beats (4 to 10 beats for 8 to 20 anglers)
    if num_beats <= 5:
        sched_font_size = 8
        sched_leading = 10
        sess_col_w = 1.6 * inch
    elif num_beats <= 7:
        sched_font_size = 7
        sched_leading = 8.5
        sess_col_w = 1.4 * inch
    else:
        sched_font_size = 6
        sched_leading = 7.5
        sess_col_w = 1.2 * inch

    sched_cell_style = ParagraphStyle(
        'SchedTableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=sched_font_size,
        leading=sched_leading,
        alignment=1
    )

    # Create Schedule Table
    # Columns: Session | Beat 1 | Beat 2 | ... | Beat N
    headers = [Paragraph("Session", cell_header)]
    col_widths = [sess_col_w]
    beat_col_w = (10.2 * inch - sess_col_w) / num_beats
    
    selected_beats = state.get("selected_beats", [])
    beat_meta_by_num = {i + 1: selected_beats[i] for i in range(len(selected_beats))}
    
    for b in range(1, num_beats + 1):
        b_info = beat_meta_by_num.get(b, {})
        b_code = b_info.get("code", f"Beat {b}")
        b_riv = b_info.get("river", "")
        riv_str = f"<br/><font size={max(5, sched_font_size-2)} color='#cbd5e1'>{b_riv}</font>" if b_riv else ""
        headers.append(Paragraph(f"<b>{b_code}</b>{riv_str}", cell_header))
        col_widths.append(beat_col_w)
        
    schedule_rows = [headers]
    
    for s in sessions:
        row = [
            Paragraph(f"<b>{s['session_name']}</b><br/><font color='#64748b' size={sched_font_size-1}>{s['day']} {s['time']}</font>", sched_cell_style)
        ]
        
        matches_by_beat = {m["beat_number"]: m for m in s["matches"]}
        for b in range(1, num_beats + 1):
            m = matches_by_beat.get(b)
            if m:
                anglers_text_parts = []
                for a in m["anglers"]:
                    if a in a_team_set:
                        anglers_text_parts.append(f"<b>{a}</b> <font color='#b45309' size={max(5, sched_font_size-1)}>[A]</font>")
                    else:
                        anglers_text_parts.append(f"<b>{a}</b>")
                anglers_text = "<br/><b>vs</b><br/>".join(anglers_text_parts)

                badge = ""
                if m.get("is_head_to_head_a_team"):
                    badge += f"<br/><font color='#b45309' size={max(5, sched_font_size-1)}><b>[A-Team Clash]</b></font>"
                if m["match_type"] == "1v1v1":
                    badge += f"<br/><font color='#0284c7' size={max(5, sched_font_size-1)}><b>[1v1v1]</b></font>"
                
                # Check if scored
                if m.get("status") in ["CONFIRMED", "ADMIN_CONFIRMED"] and "official_scores" in m:
                    scores_parts = []
                    for a in m["anglers"]:
                        f = m["official_scores"].get(a, 0)
                        p = m.get("calculated_points", {}).get(a, 0.0)
                        scores_parts.append(f"{a}: {f}f ({p:.1f}p)")
                    score_info = f"<br/><font color='#059669' size={max(5, sched_font_size-1)}><b>Score:</b> {'; '.join(scores_parts)}</font>"
                    cell_content = f"{anglers_text}{badge}{score_info}"
                else:
                    cell_content = f"{anglers_text}{badge}"
                    
                row.append(Paragraph(cell_content, sched_cell_style))
            else:
                row.append(Paragraph("-", sched_cell_style))
                
        schedule_rows.append(row)
        
    sched_table = Table(schedule_rows, colWidths=col_widths)
    sched_style = [
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#064e3b')),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]
    # Alternate row colors
    for r_idx in range(1, len(schedule_rows)):
        bg = colors.HexColor('#f8fafc') if r_idx % 2 == 1 else colors.white
        sched_style.append(('BACKGROUND', (0, r_idx), (-1, r_idx), bg))
        
    sched_table.setStyle(TableStyle(sched_style))
    elements.append(sched_table)
    
    leaderboard = state.get("leaderboard", [])

    # If 12 or more anglers, place the full leaderboard on Page 2 for clean layout
    if len(leaderboard) >= 12:
        from reportlab.platypus import PageBreak
        elements.append(PageBreak())
        elements.append(Paragraph(t_name, title_style))
        elements.append(Spacer(1, 6))
    else:
        elements.append(Spacer(1, 14))
    
    # 3. Section: Live Tournament Leaderboard
    elements.append(Paragraph("2. Official Tournament Leaderboard & Standings", h2_style))
    lb_headers = [
        Paragraph("Rank", cell_header),
        Paragraph("Angler Name", cell_header),
        Paragraph("Sat AM (S1)", cell_header),
        Paragraph("Sat PM (S2)", cell_header),
        Paragraph("Sun AM (S3)", cell_header),
        Paragraph("Sun PM (S4)", cell_header),
        Paragraph("Total Points", cell_header),
        Paragraph("Total Fish", cell_header),
        Paragraph("Blanks", cell_header),
    ]
    lb_col_widths = [0.8 * inch, 2.6 * inch, 1.1 * inch, 1.1 * inch, 1.1 * inch, 1.1 * inch, 1.2 * inch, 1.0 * inch, 0.8 * inch]
    
    lb_rows = [lb_headers]
    for e in leaderboard:
        # Highlight top 3 with medal icons or text
        rank_str = f"#{e['rank']}"
        if e['rank'] == 1: rank_str = "1st [Gold]"
        elif e['rank'] == 2: rank_str = "2nd [Silver]"
        elif e['rank'] == 3: rank_str = "3rd [Bronze]"
        
        def fmt_s(s_id):
            pts = e["session_points"].get(s_id, 0.0)
            fish = e["session_fish"].get(s_id, 0)
            blank = e["session_blanks"].get(s_id, False)
            if blank:
                return "<font color='#ef4444'>0.00 pts (0f)</font>"
            elif pts > 0 or fish > 0:
                return f"<b>{pts:.2f}</b> ({fish}f)"
            return "<font color='#94a3b8'>-</font>"

        a_badge = " <font color='#b45309' size=7.5><b>[A-Team]</b></font>" if (e.get("is_a_team") or e["name"] in a_team_set) else ""
        lb_rows.append([
            Paragraph(f"<b>{rank_str}</b>", cell_style),
            Paragraph(f"<b>{e['name']}</b>{a_badge}", cell_bold),
            Paragraph(fmt_s(1), cell_style),
            Paragraph(fmt_s(2), cell_style),
            Paragraph(fmt_s(3), cell_style),
            Paragraph(fmt_s(4), cell_style),
            Paragraph(f"<font color='#064e3b' size=10><b>{e['total_points']:.2f}</b></font>", cell_style),
            Paragraph(f"<b>{e['total_fish']}</b>", cell_style),
            Paragraph(f"<font color='{'#ef4444' if e['blanks_count'] > 0 else '#10b981'}'><b>{e['blanks_count']}</b></font>", cell_style),
        ])
        
    lb_table = Table(lb_rows, colWidths=lb_col_widths)
    lb_table_style = [
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e293b')),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
        ('TOPPADDING', (0, 0), (-1, -1), 3.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3.5),
    ]
    for r_idx in range(1, len(lb_rows)):
        if r_idx == 1:
            bg = colors.HexColor('#fef3c7') # Gold top row
        elif r_idx == 2:
            bg = colors.HexColor('#f1f5f9') # Silver
        elif r_idx == 3:
            bg = colors.HexColor('#ffedd5') # Bronze
        else:
            bg = colors.HexColor('#f8fafc') if r_idx % 2 == 1 else colors.white
        lb_table_style.append(('BACKGROUND', (0, r_idx), (-1, r_idx), bg))
        
    lb_table.setStyle(TableStyle(lb_table_style))
    elements.append(lb_table)
    
    # Build Document
    doc.build(elements)
    return output_path

if __name__ == "__main__":
    from database import TournamentDB
    db = TournamentDB()
    test_pdf = os.path.join(os.path.dirname(__file__), "test_schedule.pdf")
    generate_tournament_pdf(db.get_full_state(), test_pdf)
    print("Test PDF created successfully at:", test_pdf)
