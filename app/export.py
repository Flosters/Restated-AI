from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from .models import ContractModel
import io
import re

def add_page_number(canvas, doc):
    """
    Add the page number to the bottom of the page.
    """
    page_num = canvas.getPageNumber()
    text = f"Page {page_num}"
    canvas.saveState()
    canvas.setFont("Helvetica", 9)
    canvas.drawRightString(letter[0] - 50, 30, text)
    canvas.restoreState()

from .models import ContractModel, Amendment # Need Amendment model access
from sqlalchemy.orm import Session # Need session to query amendments if lazy loading not ample

def generate_pdf_export(contract: ContractModel) -> bytes:
    """
    Generates a professionally formatted PDF byte stream for the current state of the contract (Amended and Restated).
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=72,
        leftMargin=72,
        topMargin=72,
        bottomMargin=72
    )
    
    styles = getSampleStyleSheet()
    
    # Custom Styles
    title_style = ParagraphStyle(
        'RestatedTitle',
        parent=styles['Title'],
        fontSize=18,
        spaceAfter=20,
        alignment=1 # Center
    )
    
    subtitle_style = ParagraphStyle(
        'RestatedSubtitle',
        parent=styles['Normal'],
        fontSize=10,
        spaceAfter=30,
        alignment=1, # Center
        leftIndent=20,
        rightIndent=20
    )
    
    header_style = ParagraphStyle(
        'ClauseHeader',
        parent=styles['Heading2'],
        fontSize=12,
        spaceBefore=15,
        spaceAfter=6,
        textColor=colors.black
    )
    
    text_style = ParagraphStyle(
        'ClauseText',
        parent=styles['BodyText'],
        fontSize=11,
        leading=14, # Line height
        spaceAfter=10,
        alignment=4 # Justify
    )

    intro_text_style = ParagraphStyle(
        'IntroText',
        parent=styles['BodyText'],
        fontSize=11,
        leading=16,
        spaceAfter=20,
        spaceBefore=10,
        alignment=4,  # Justify
        textColor=colors.HexColor('#333333')
    )

    story = []

    # Title Page
    # Ideally we'd infer the real title (e.g. "Consulting Agreement") but for now "AMENDED AND RESTATED" + filename is okay fallback
    story.append(Paragraph("AMENDED AND RESTATED AGREEMENT", title_style))
    story.append(Spacer(1, 10))
    
    # Construct History String
    # "This document integrates: [Original] dated [X],..."
    history_text = f"This document integrates the original agreement found in <b>{contract.filename}</b>"
    
    # Iterate through amendments securely via relationship
    if hasattr(contract, 'amendments') and contract.amendments:
        history_text += ", as modified by:<br/><br/>"
        for i, amd in enumerate(contract.amendments):
            # Parse description or use fallback
            # Description format from amendment.py is "Title: {title} | Date: {date}"
            # We want to show "1. {Title} dated {Date}"
            try:
                parts = amd.description.split(" | ")
                title_part = parts[0].replace("Title: ", "")
                date_part = parts[1].replace("Date: ", "")
                # Format
                history_text += f"{i+1}. <b>{title_part}</b> dated {date_part}<br/>"
            except:
                 history_text += f"{i+1}. {amd.filename} (Applied: {amd.upload_timestamp})<br/>"
    else:
        history_text += "."
    
    story.append(Paragraph(history_text, subtitle_style))
    story.append(Spacer(1, 30))
    
    # Clauses
    previous_exhibit_prefix = None

    for clause in contract.clauses:
        clause_id = clause.get('id', '')

        # Check if header matches agreement title (avoid duplicate title display)
        header_text = clause.get('header', '')
        header_matches_title = False
        if header_text and contract.agreement_type:
            # Normalize both strings for comparison (remove punctuation, uppercase)
            normalized_header = header_text.upper().replace('.', '').replace(',', '').replace('-', ' ').strip()
            normalized_type = contract.agreement_type.upper().replace('.', '').replace(',', '').replace('-', ' ').strip()
            header_matches_title = normalized_header == normalized_type or normalized_type in normalized_header

        # If header matches title, we'll show the text but not the header (to avoid duplicate title)
        # If no text, skip the clause entirely
        if header_matches_title:
            content_text = clause.get('text', '')
            if not content_text or not content_text.strip():
                continue  # Skip if no text
            # Otherwise, render as intro clause (no header, just text)
            # Set header_text to empty so it won't be rendered
            header_text = ''
            # Mark as intro clause for special styling
            is_intro_clause = True
        else:
            is_intro_clause = False

        # Check if this clause is part of an Exhibit/Annex/Schedule
        # Exhibit IDs follow pattern: exhibit_a_title, exhibit_a_1, exhibit_b_title, etc.
        is_exhibit = any(clause_id.startswith(prefix) for prefix in ['exhibit_', 'annex_', 'schedule_'])

        if is_exhibit:
            # Extract the exhibit prefix (e.g., "exhibit_a" from "exhibit_a_1")
            exhibit_prefix = '_'.join(clause_id.split('_')[:2]) if '_' in clause_id else clause_id

            # If this is a new exhibit (different from previous), add a page break
            if previous_exhibit_prefix != exhibit_prefix:
                story.append(PageBreak())
                previous_exhibit_prefix = exhibit_prefix

        # Check if this is a signature block
        is_signature_block = 'signature' in clause_id.lower()

        # Check if this is an introductory clause (preamble, recitals, etc.)
        # Either set earlier (title clause with preamble text) OR matches intro clause patterns
        if not is_intro_clause:  # Don't overwrite if already set to True
            is_intro_clause = not header_text and (
                'introduction' in clause_id.lower() or
                'recital' in clause_id.lower() or
                'preamble' in clause_id.lower() or
                'whereas' in clause_id.lower()
            )

        # Header (skip if empty or signature block)
        if header_text and not is_signature_block:
            story.append(Paragraph(header_text, header_style))

        # Text
        content_text = clause.get('text', '')

        if is_signature_block:
            # Special formatting for signature blocks
            # Parse the content to find party names and create individual signature blocks
            lines = content_text.split('\n')
            party_names = []
            witness_text = []

            # Legal entity suffixes used to detect company/party names
            _entity_suffixes = re.compile(
                r'\b(Inc\.?|LLC\.?|Ltd\.?|Corp\.?|Co\.?|L\.?P\.?|LLP\.?|PLC\.?|S\.?A\.?|'
                r'GmbH|AG|N\.?V\.?|B\.?V\.?|S\.?L\.?|S\.?R\.?L\.?|Foundation|Trust)\s*$',
                re.IGNORECASE
            )

            def _is_party_name(text: str) -> bool:
                """Detect if a line is a party/company name."""
                # All-caps with 2+ words (original heuristic)
                if text.isupper() and len(text.split()) >= 2:
                    return True
                # Contains a legal entity suffix (Inc., LLC, Ltd., Corp, etc.)
                if _entity_suffixes.search(text):
                    return True
                return False

            # First pass: extract party names and witness text
            for line in lines:
                line_original = line
                line = line.strip()

                # Skip empty lines
                if not line:
                    continue

                # Skip role placeholders (single words like "COMPANY", "CONSULTANT")
                if line.upper() in ['COMPANY', 'CONSULTANT', 'CLIENT', 'PARTY', 'SELLER', 'BUYER', 'VENDOR', 'PURCHASER']:
                    continue

                # Skip "By:" lines as we'll generate our own
                if line.startswith('By:'):
                    continue

                # Skip "Name:" and "Title:" lines from parsed content
                if line.startswith('Name:') or line.startswith('Title:'):
                    continue

                # Skip lines that are a person's name + title (e.g. "John Doe, CEO")
                # These follow party names and should not be rendered
                if re.match(r'^[\w][\w\s.\'-]+,\s*(CEO|CFO|COO|CTO|President|Director|Manager|Managing Director|Partner|Secretary|Treasurer|VP|Vice President|Chairman|Chairperson|Founder|Principal|Officer|Head)\s*$', line, re.UNICODE):
                    continue

                # Check if this line contains multiple party names (side-by-side format)
                if re.search(r'[A-Z][A-Za-z\s]+\s{2,}[A-Z][A-Za-z\s]+', line_original):
                    parts = re.split(r'\s{2,}', line)
                    for part in parts:
                        part = part.strip()
                        if part and _is_party_name(part):
                            party_names.append(part)
                elif _is_party_name(line):
                    party_names.append(line)
                else:
                    # Other text like "IN WITNESS WHEREOF"
                    witness_text.append(line)

            # Fallback: if no party names detected from text, use contract.parties
            if not party_names and hasattr(contract, 'parties') and contract.parties:
                party_names = list(contract.parties)

            # Build signature block elements
            sig_elements = []

            # Add witness text first (like "IN WITNESS WHEREOF, the Parties have executed...")
            for text in witness_text:
                sig_elements.append(Paragraph(text, text_style))

            if witness_text:
                sig_elements.append(Spacer(1, 20))

            # Create separate signature block for each party
            for party_name in party_names:
                # Party name in bold
                sig_elements.append(Paragraph(f"<b>{party_name}</b>", text_style))
                sig_elements.append(Spacer(1, 36))  # Large space before signature line

                # Signature line
                sig_elements.append(Paragraph("By: _________________________________", text_style))

                # Name and Title fields (no spacer between them for compact look)
                sig_elements.append(Paragraph("Name:", text_style))
                sig_elements.append(Paragraph("Title:", text_style))

                # Space between signature blocks (but not after the last one)
                if party_name != party_names[-1]:
                    sig_elements.append(Spacer(1, 40))

            # Always add signature page marker and start signatures on new page
            # This is standard practice for legal documents
            story.append(Spacer(1, 20))
            story.append(Paragraph("<i>[Signature Page Follows]</i>", text_style))
            story.append(PageBreak())
            story.extend(sig_elements)
        else:
            # Regular clause text
            # Use special styling for intro clauses (preamble, recitals)
            style_to_use = intro_text_style if is_intro_clause else text_style

            # Split by double newlines to handle multiple paragraphs within a clause
            paragraphs = content_text.split('\n\n')
            for p_text in paragraphs:
                if not p_text.strip():
                    continue
                # Handle single line breaks within a paragraph
                p_text = p_text.replace('\n', '<br/>')
                story.append(Paragraph(p_text, style_to_use))
                story.append(Spacer(1, 6)) # Small spacer between paragraphs in the same clause
        
    doc.build(story, onFirstPage=add_page_number, onLaterPages=add_page_number)
    
    buffer.seek(0)
    return buffer.getvalue()
