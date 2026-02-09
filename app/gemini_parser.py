from google import genai
from google.genai import types
import os
import json
import time
import re
from typing import List, Dict, Any
from .schemas import ContractAnalysis, Clause
from pydantic import BaseModel

# Configure Gemini
api_key = os.getenv("GOOGLE_API_KEY")
if not api_key:
    raise ValueError("GOOGLE_API_KEY environment variable is required. Please set it in your .env file.")
client = genai.Client(api_key=api_key)


def _gemini_generate_with_retry(*, max_retries: int = 5, **kwargs):
    """
    Wrapper around client.models.generate_content that retries on 429
    RESOURCE_EXHAUSTED errors with exponential backoff.
    """
    for attempt in range(max_retries):
        try:
            return client.models.generate_content(**kwargs)
        except Exception as e:
            error_str = str(e)
            if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
                # Try to extract retry delay from the error message
                delay_match = re.search(r'retryDelay.*?(\d+)', error_str)
                if delay_match:
                    wait_time = int(delay_match.group(1)) + 2
                else:
                    wait_time = min(15 * (2 ** attempt), 120)
                print(f"Rate limited (attempt {attempt + 1}/{max_retries}). Waiting {wait_time}s...")
                time.sleep(wait_time)
            else:
                raise  # Non-rate-limit error, propagate immediately
    # Final attempt — let any exception propagate
    return client.models.generate_content(**kwargs)

SYSTEM_PROMPT = """
You are a specialized Legal Document Parser. Your task is to extract the structure of a contract from a PDF with absolute precision.

Rules:
1. Extract each clause with its EXACT header and EXACT text. CRITICAL: Extract text as PLAIN TEXT only - do NOT add any formatting markers (no markdown, no HTML, no **bold**, no *italic*, no __underline__). The text should be exactly as it appears in the PDF without any added formatting codes.
2. HEADER vs TEXT SEPARATION: NEVER duplicate content between header and text fields. The header contains the clause/section number and optional title. The text contains the body content that follows. Do NOT repeat the same sentence or paragraph in both fields.
3. DO NOT merge words (e.g., "ANDDigital" must stay as "AND Digital" if there is a space, or be corrected if it's an OCR artifact).
4. PRESERVE whitespace and line breaks INTELLIGENTLY:
   - Use `\\n\\n` to separate distinct paragraphs or sentences that start on a new line
   - DO NOT insert `\\n\\n` in the middle of a sentence, even if the PDF has a line break there
   - If a sentence spans multiple lines in the PDF, keep it as one continuous sentence with spaces (not line breaks)
   - Only use `\\n\\n` for actual paragraph boundaries
5. If a colon is followed by a name (e.g., "between:Agile"), ensure there is a space if appropriate for legal formatting ("between: Agile").
6. Each clause must have a page number.
7. The "id" field should be a short, unique identifier based on the clause number or header if possible (e.g., "clause_1", "preamble"), otherwise a unique string.
8. SUB-SECTION HANDLING:
   a) NUMERIC SUB-SECTIONS (e.g., 1.1, 1.2, 3.1, 3.2, or 1.1.1, 1.1.2):
      - Create a PARENT entry for the article header with id like "clause_3". The `text` field of the parent should be EMPTY string "".
      - Create SEPARATE entries for each numeric sub-section with ids like "clause_3_1", "clause_3_2".
      - CRITICAL - HEADER vs TEXT: For each sub-section:
        * The HEADER field should contain: subsection number + title ONLY (e.g., "1.1. Services and Term")
        * The TEXT field should contain: the body content that follows, WITHOUT repeating the subsection number
        * Example: If the PDF shows "1.1. With effect from the Effective Date, the Consultant agrees..."
          → header = "1.1. Services and Term" (or just "1.1." if no title)
          → text = "With effect from the Effective Date, the Consultant agrees..." (NO subsection number)
        * NEVER duplicate the same sentence in both header and text fields

   b) LETTERED SUB-SECTIONS vs ENUMERATED LISTS - READ CAREFULLY:

      SCENARIO 1 - ENUMERATED LIST (Keep together as ONE clause):
      - If a clause has INTRODUCTORY TEXT followed by a phrase indicating a list will follow (e.g., "shall include the following:", "include, but not limited to, the following:", "consists of:", "are as follows:"), and THEN lettered items (A., B., C.), this is an ENUMERATED LIST
      - Keep the ENTIRE clause together (intro text + all lettered items) in ONE clause with the text field
      - DO NOT split the lettered items into separate clauses

      Example - If you see:
      "1. Services.
       Consultant shall provide services as a patent agent. The Services shall include, but not limited to, the following:
       A. Initiate and manage patent portfolios.
       B. Maintain documentation processes.
       C. Perform patent searches."

      Create ONE clause:
      {id: "exhibit_a_1", header: "1. Services.", text: "Consultant shall provide services... The Services shall include, but not limited to, the following:\n\nA. Initiate and manage patent portfolios.\n\nB. Maintain documentation processes.\n\nC. Perform patent searches."}

      SCENARIO 2 - LETTERED SUB-SECTIONS (Split into separate clauses):
      - If a clause has a TITLE and IMMEDIATELY after (with NO introductory text, NO "include the following" phrase) there are lettered paragraphs (A., B., C.), these are SUB-SECTIONS
      - Create a PARENT with empty text, then SEPARATE clauses for each letter

      Example - If you see:
      "2. Compensation.
       A. The Client shall pay a fee of $5,000 per month.
       B. Payment is due within 15 days of invoice."

      Create THREE clauses:
      1) {id: "exhibit_a_2", header: "2. Compensation.", text: ""}
      2) {id: "exhibit_a_2_a", header: "A.", text: "The Client shall pay a fee of $5,000 per month."}
      3) {id: "exhibit_a_2_b", header: "B.", text: "Payment is due within 15 days of invoice."}

      KEY DIFFERENCE: Look for introductory/explanatory text and list-indicating phrases ("include the following", "shall include", "consists of", "are as follows"). If present = enumerated list (keep together). If absent = sub-sections (split apart).

   c) INLINE LETTERED LISTS (NOT sub-sections):
      - If a clause text contains letters as an inline list (e.g., "The services include: (a) consulting, (b) analysis, and (c) reporting"), keep these WITHIN the clause text - do NOT split them
      - Points labeled with lowercase letters in parentheses (a), (b), (c) or roman numerals (i), (ii), (iii) within flowing text should remain in the parent clause
10. If an article has NO numeric sub-sections (the entire text is one continuous block, possibly with lettered points inside), keep it as a SINGLE entry with both header and text.
11. Sub-section ids must follow the pattern: clause_{article}_{subsection} (e.g., "clause_3_1", "clause_3_2") - ONLY for numeric sub-sections.
12. CRITICAL - TITLED PARAGRAPHS ARE NOT SUB-SECTIONS: If a clause body contains titled descriptions (e.g., bold or capitalized topic headings like "Digital Strategy Advisory" or "Business Process Optimization") followed immediately by explanatory text, these are NOT sub-sections. Keep the ENTIRE content (all titled paragraphs, lettered points, and their text) within the single clause's `text` field.
13. RECITALS/WHEREAS CLAUSES: If the contract contains recitals (statements starting with "WHEREAS") and a transitional clause (starting with "NOW, THEREFORE" or "NOW THEREFORE"), group them together as a single clause:
   a) Do NOT create a separate header/title for this section
   b) The header should be an empty string "" or "Recitals"
   c) The text field should contain ALL WHEREAS statements in their correct order, followed by the NOW THEREFORE statement
   d) Keep all formatting and line breaks between statements
   e) Use id "recitals" or "whereas_clauses"
14. SIGNATURE BLOCK: The signature block should be extracted as a separate clause at the END of the main agreement (before any Exhibits/Annexes):
   a) Look for phrases like "IN WITNESS WHEREOF", "IN WITNESS THEREOF", "EXECUTED as of", or similar signature introductions
   b) Include the signature introduction phrase and all signature lines/dates that follow
   c) Format the text with proper structure:
      - Each party's signature section should list: PARTY NAME (in caps), By:, Name:, Title: (if company)
      - For natural persons, only include their name
      - Separate each party's signature block with line breaks
   d) Use header="" (empty string, no title for signature blocks)
   e) Use id "signature_block" or "signatures"
   f) This clause should appear AFTER all numbered clauses but BEFORE any Exhibits/Annexes
   g) EXHIBIT SIGNATURE BLOCKS: If an Exhibit has its own signature block (e.g., "This Exhibit A is accepted..."), include the acceptance phrase in the signature block text and use id like "exhibit_a_signatures". Do NOT create a separate header - leave header empty.
15. EXHIBITS AND ANNEXES - CRITICAL REQUIREMENT: You MUST extract the COMPLETE AND FULL content of ALL Exhibits, Annexes, Schedules, and Attachments:
   a) Exhibits/Annexes are INTEGRAL PARTS of the agreement and must be processed with the SAME RULES as the main body
   b) Extract EVERY SINGLE clause, section, paragraph, and sentence from each Exhibit/Annex - do NOT summarize or skip any content
   c) EXHIBIT STRUCTURE - Process Exhibits with the following hierarchy:
      - First, create a clause for the Exhibit TITLE (e.g., "EXHIBIT A - STATEMENT OF WORK") with id like "exhibit_a_title", header="EXHIBIT A - STATEMENT OF WORK", text=""
      - If there's a preamble/introduction paragraph (e.g., "This Statement of Work is issued..."), include it as text in a clause with header="" (empty string, NO title like "Preamble") and id like "exhibit_a_preamble"
      - Then extract each NUMBERED clause (1., 2., 3., etc.) from the Exhibit as SEPARATE clauses with ids like "exhibit_a_1", "exhibit_a_2", etc.
      - LETTERED SUB-SECTIONS IN EXHIBITS: Apply the same lettered sub-section rules as the main agreement (Rule 8b):
        * If an Exhibit clause has a TITLE (e.g., "2. Compensation") followed by separate PARAGRAPHS starting with A., B., C., create separate sub-sections with ids like "exhibit_a_2_a", "exhibit_a_2_b"
        * If letters appear as an inline list within flowing text, keep them together - do NOT split them
      - Follow the same rules as the main agreement for all sub-section handling
   d) EXAMPLE STRUCTURE for "EXHIBIT A - Statement of Work":

      EXAMPLE 1 - ENUMERATED LIST (keep together as ONE clause):
      If the PDF shows:
      "1. Services.
       Consultant shall provide services as a patent agent of Company. The Services to be rendered by Consultant shall include, but not be limited to, the following:
       A. Initiate, manage, and direct outside counsel prosecuting patent portfolios.
       B. Maintain and manage documentation processes relating to patent laws.
       C. Perform patent searches in biotechnology and life sciences."

      Create ONE clause:
      - Clause: id="exhibit_a_1", header="1. Services.", text="Consultant shall provide services as a patent agent of Company. The Services to be rendered by Consultant shall include, but not be limited to, the following:\n\nA. Initiate, manage, and direct outside counsel prosecuting patent portfolios.\n\nB. Maintain and manage documentation processes relating to patent laws.\n\nC. Perform patent searches in biotechnology and life sciences."

      EXAMPLE 2 - LETTERED SUB-SECTIONS (split into separate clauses):
      If the PDF shows:
      "2. Compensation.
       A. As consideration for the Services, the Company will pay...
       B. The Company will reimburse Consultant for all reasonable expenses..."

      Create THREE separate clauses:
      - Clause: id="exhibit_a_2", header="2. Compensation.", text="" (EMPTY - parent only)
      - Clause: id="exhibit_a_2_a", header="A.", text="As consideration for the Services, the Company will pay..." (NO "A." prefix in text)
      - Clause: id="exhibit_a_2_b", header="B.", text="The Company will reimburse Consultant for all reasonable expenses..." (NO "B." prefix in text)

      KEY DISTINCTION: Check for introductory text with list-indicating phrases like "include the following", "shall include, but not limited to", "consists of", "are as follows". If present = keep together as enumerated list. If absent and letters immediately follow title = split into sub-sections.
   e) NUMERIC SUB-SECTIONS IN EXHIBITS: If an Exhibit clause contains numeric sub-sections (1.1, 1.2), split them like normal (parent clause has empty text, sub-sections are separate)
   f) VERIFICATION: Before finishing, verify that you have extracted ALL Exhibits/Annexes listed in the document with their complete hierarchical structure.
"""

def parse_contract_with_gemini(pdf_bytes: bytes) -> List[Dict[str, Any]]:
    """
    Parses a PDF contract using Gemini 2.5 Flash and returns a list of clauses.
    """
    
    # Create the content part for the PDF
    # The SDK accepts bytes directly in the 'data' field for inline data
    pdf_part = types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf")
    
    try:
        response = _gemini_generate_with_retry(
            model="models/gemini-2.5-flash",
            contents=[pdf_part],
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                response_mime_type="application/json",
                response_schema=ContractAnalysis
            )
        )
        
        # The SDK automatically parses the JSON into the Pydantic model
        if response.parsed:
            # Convert Pydantic models to list of dicts to maintain compatibility
            # with the rest of the app which expects list of dicts
            return [clause.model_dump() for clause in response.parsed.clauses]
            
        # Fallback if parsed is empty (unlikely with response_schema)
        raise ValueError("Gemini returned empty response")
        
    except Exception as e:
        print(f"Error calling Gemini: {e}")
        raise e

from .schemas import ChangeLogItem, AmendmentMetadata

AMENDMENT_PROMPT = """
You are a specialized Legal Editor.
You will receive:
1. A JSON structure representing the CURRENT clauses of a contract (with IDs and Headers).
2. A PDF document which is an AMENDMENT or SIDE LETTER to that contract.

CRITICAL OUTPUT RULES:
- Return ONLY clean JSON data - NO explanatory text, NO reasoning, NO analysis, NO markdown formatting
- The `new_text` field must contain ONLY the actual replacement clause text from the amendment PDF
- DO NOT include phrases like "Based on the Amendment" or "The changes are identified as" or any meta-commentary
- DO NOT include your reasoning process or explanations in ANY field
- Extract text EXACTLY as it appears in the PDF without adding your own commentary

Your Job:
Identify exactly how the Amendment modifies the existing clauses.

Rules for Mapping:
1. Look for clause numbers and titles in the Amendment (e.g., "Clause 3", "Section 8").
2. EXHIBIT/ANNEX REFERENCES: When the amendment refers to a section, check if it specifies whether it's from the main Agreement or from an Exhibit/Annex (e.g., "Section 2 of Exhibit A" vs "Section 2 of the Agreement"). If the amendment clearly states "Section X of Exhibit A" or "Section X of Annex B", then target that exhibit section. If no clarification is provided, assume it refers to the main Agreement.
3. Match these to the corresponding clauses in the provided JSON. CROSS-REFERENCE the clause number (e.g., "3.") and the title (e.g., "FEES") with the `header` field in the JSON.
4. Use the EXACT `id` from the JSON for the `target_clause_id`.
5. CRISIS PREVENTION: It is critical that you do not map an amendment for "Clause 3" to "Clause 8". If the headers don't match the intent of the amendment, do not apply the change.
6. INCORPORATION CLAUSES - NOT AMENDMENTS: If the amendment contains language like "The provisions of Section X, Y, and Z of the Agreement shall apply to this Amendment" or "are incorporated into this Amendment" or "apply mutatis mutandis", this is NOT modifying the original agreement. These clauses are simply incorporating existing provisions into the amendment itself. DO NOT create any change log entries for these - they are not amendments to the original contract.
7. If the Amendment says "Section X is deleted", use the DELETE action.
8. If the Amendment introduces a COMPLETELY NEW clause not present in the JSON, you may skip it for now.
9. SUB-SECTION TARGETING: If the contract JSON has sub-sections (e.g., "clause_3_1", "clause_3_2"), target the SPECIFIC sub-section that is being amended, NOT the parent article. For example, if Amendment says "Section 3.1 is replaced with...", use target_clause_id "clause_3_1", NOT "clause_3".
10. SIDE LETTER HANDLING: If the document is a Side Letter:
   a) Use the SIDE_LETTER_TAG action for clauses it affects (doesn't replace, just modifies behavior).
   b) A Side Letter typically says things like "Notwithstanding Section X..." or "The parties agree that Section X shall not apply" or similar language that refers to an existing clause.
   c) You MUST identify the specific clause(s) being referenced and tag them.
   d) If the Side Letter affects a sub-section specifically (e.g., references "Section 3.2"), target that specific sub-section id.
   e) If it affects an entire article, tag EACH sub-section under that article individually.
11. SIDE LETTER TEXT EXTRACTION: When using SIDE_LETTER_TAG action, you MUST also populate the `side_letter_text` field with the COMPLETE and EXACT text of the clause FROM the side letter document that references the target clause. This includes:
   a) The clause number and title (e.g., "1. WAIVER OF LATE PAYMENT INTEREST")
   b) The full body text (e.g., "Notwithstanding anything to the contrary in Section 3.2 of the Agreement, ...")
   c) Preserve ALL original formatting, line breaks, and whitespace exactly as they appear in the side letter.
   d) This text must be self-contained and readable on its own, showing the complete waiver/exception/modification language.
12. DELETE TEXT EXTRACTION: When using the DELETE action, set `new_text` to the FULL TEXT of the amendment clause that orders the deletion (e.g., "1. DELETE CLAUSE 6 (INDEPENDENT CONTRACTOR)\nSection 6 (INDEPENDENT CONTRACTOR) of the Agreement is hereby deleted in its entirety."). Also set `deletion_clause_text` to the same text. This preserves the original amendment language explaining the deletion.

Return ONLY the JSON list of objects matching the schema.
"""

def generate_change_log(original_clauses_json: List[Dict], amendment_pdf_bytes: bytes) -> List[ChangeLogItem]:
    
    pdf_part = types.Part.from_bytes(data=amendment_pdf_bytes, mime_type="application/pdf")
    
    # Convert original JSON to string for the prompt
    original_context_part = f"ORIGINAL CONTRACT CLAUSES (JSON):\n{json.dumps(original_clauses_json, indent=2)}"
    
    try:
        # We need a different schema for the response: List[ChangeLogItem]
        class ChangeLog(BaseModel):
            changes: List[ChangeLogItem]

        response = _gemini_generate_with_retry(
            model="models/gemini-2.5-flash", 
            contents=[original_context_part, pdf_part],
            config=types.GenerateContentConfig(
                system_instruction=AMENDMENT_PROMPT,
                response_mime_type="application/json",
                response_schema=ChangeLog
            )
        )
        
        if response.parsed:
            return response.parsed.changes
            
        raise ValueError("Gemini returned empty response for amendment")

    except Exception as e:
        print(f"Error calling Gemini for Amendment: {e}")
        raise e

METADATA_PROMPT = """
You are a legal document analyzer. 
Extract the official Title and the Effective Date (or Last Signature Date) from this PDF.
Examples of titles: "Amendment No. 1", "First Amendment to Consulting Agreement", "Side Letter".
Format the date as YYYY-MM-DD if possible, otherwise keep the string as found.
"""

def extract_amendment_metadata(pdf_bytes: bytes) -> AmendmentMetadata:
    pdf_part = types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf")
    try:
        response = _gemini_generate_with_retry(
            model="models/gemini-2.5-flash",
            contents=[pdf_part],
            config=types.GenerateContentConfig(
                system_instruction=METADATA_PROMPT,
                response_mime_type="application/json",
                response_schema=AmendmentMetadata
            )
        )
        if response.parsed:
            return response.parsed
        raise ValueError("Empty metadata response")
    except Exception as e:
        print(f"Metadata extraction error: {e}")
        # Fallback
        return AmendmentMetadata(title="Unknown Amendment", date="0000-00-00")


# --- New Functions for Enhanced Viewer ---

SUMMARY_PROMPT = """
You are a legal document summarizer. Given a restated contract and its amendment history, write a concise 2-3 sentence summary.

The summary should:
1. Mention what type of agreement this is (e.g., "Master Services Agreement", "Consulting Agreement")
2. Note how many amendments were consolidated
3. Highlight 1-2 key changes (e.g., "revised payment terms", "extended term")

Example output:
"This A&R Agreement consolidates the original MSA dated Jan 2023 with Amendment No. 1 (Pricing updates) and the Side Letter regarding IP indemnification. Key changes include revised payment terms from Net 30 to Net 45 and expanded liability caps for AI-generated code."
"""

class SummaryResponse(BaseModel):
    summary: str

def generate_contract_summary(clauses: List[Dict], amendments: List[Dict]) -> str:
    """Generate AI summary of the restated agreement."""
    context = f"""
CURRENT CLAUSES:
{json.dumps(clauses[:5], indent=2)}  # First 5 clauses for context

AMENDMENT HISTORY:
{json.dumps(amendments, indent=2)}
"""
    try:
        response = _gemini_generate_with_retry(
            model="models/gemini-2.5-flash",
            contents=[context],
            config=types.GenerateContentConfig(
                system_instruction=SUMMARY_PROMPT,
                response_mime_type="application/json",
                response_schema=SummaryResponse
            )
        )
        if response.parsed:
            return response.parsed.summary
        return "Summary generation failed."
    except Exception as e:
        print(f"Summary generation error: {e}")
        return "Unable to generate summary."


PARTIES_PROMPT = """
Extract the FULL LEGAL NAMES of all parties to this contract from the preamble or signature blocks.

Rules:
1. For companies/entities: Use the complete legal name (e.g., "Digital Innovation LLC", "Acme Corporation")
2. For natural persons: Use their full name as written (e.g., "Javier Varisco", "John Smith")
3. Do NOT include:
   - Defined terms or role descriptions (e.g., "the Client", "the Consultant", "the Company")
   - Generic descriptions (e.g., "a biotech company", "an individual")
4. Extract only the actual names as they appear in the agreement

Return only the actual legal names in the order they appear.
"""

class PartiesResponse(BaseModel):
    parties: List[str]

def extract_parties_from_clauses(clauses: List[Dict]) -> List[str]:
    """Extract party names from the contract clauses (usually preamble)."""
    # Look for preamble clause
    preamble_text = ""
    for clause in clauses:
        if clause.get('id') == 'preamble' or 'preamble' in clause.get('header', '').lower():
            preamble_text = clause.get('text', '')
            break
    
    if not preamble_text and clauses:
        # Use first clause if no preamble
        preamble_text = clauses[0].get('text', '')
    
    if not preamble_text:
        return []
    
    try:
        response = _gemini_generate_with_retry(
            model="models/gemini-2.5-flash",
            contents=[f"Contract text:\n{preamble_text}"],
            config=types.GenerateContentConfig(
                system_instruction=PARTIES_PROMPT,
                response_mime_type="application/json",
                response_schema=PartiesResponse
            )
        )
        if response.parsed:
            return response.parsed.parties
        return []
    except Exception as e:
        print(f"Party extraction error: {e}")
        return []


# --- Title and Preamble Extraction ---

TITLE_PROMPT = """
Extract ONLY the type of agreement from this contract text.
Examples: "Consulting Services Agreement", "Master Services Agreement", "Employment Agreement", "License Agreement"
Return ONLY the agreement type without:
- Company names
- Party names
- "This" or "Agreement between" prefixes
- "Amended & Restated" prefix
- Any other descriptive text

Just the core agreement type.
"""

class TitleResponse(BaseModel):
    agreement_type: str

def extract_contract_title(clauses: List[Dict]) -> str:
    """Extract the agreement type from preamble/first clause."""
    # Look for preamble or first clause
    text = ""
    for clause in clauses:
        if clause.get('id') == 'preamble' or 'preamble' in clause.get('header', '').lower():
            text = clause.get('text', '')
            break
    
    if not text and clauses:
        text = clauses[0].get('text', '')
    
    if not text:
        return "Agreement"
    
    try:
        response = _gemini_generate_with_retry(
            model="models/gemini-2.5-flash",
            contents=[f"Contract text:\n{text[:500]}"],  # First 500 chars
            config=types.GenerateContentConfig(
                system_instruction=TITLE_PROMPT,
                response_mime_type="application/json",
                response_schema=TitleResponse
            )
        )
        if response.parsed:
            return response.parsed.agreement_type
        return "Agreement"
    except Exception as e:
        print(f"Title extraction error: {e}")
        return "Agreement"


PREAMBLE_PROMPT = """
Extract the preamble/heading section of this contract.
This typically includes:
- The agreement title
- The parties ("between X and Y")
- The effective date
- Any recitals or "WHEREAS" clauses

Return the complete preamble text as it appears in the document.
"""

class PreambleResponse(BaseModel):
    preamble: str

def extract_preamble(clauses: List[Dict]) -> str:
    """Extract the original preamble from contract clauses."""
    # Look for preamble clause
    for clause in clauses:
        if clause.get('id') == 'preamble' or 'preamble' in clause.get('header', '').lower():
            return clause.get('text', '')
    
    # If no preamble clause, try to extract from first clause
    if clauses:
        first_text = clauses[0].get('text', '')
        try:
            response = _gemini_generate_with_retry(
                model="models/gemini-2.5-flash",
                contents=[f"Contract text:\n{first_text}"],
                config=types.GenerateContentConfig(
                    system_instruction=PREAMBLE_PROMPT,
                    response_mime_type="application/json",
                    response_schema=PreambleResponse
                )
            )
            if response.parsed:
                return response.parsed.preamble
        except Exception as e:
            print(f"Preamble extraction error: {e}")
    
    return ""


# --- Bullet Summary for Dashboard Hover ---

BULLET_SUMMARY_PROMPT = """
Summarize this contract in EXACTLY 3 bullet points. Each bullet should be 10-15 words maximum.

Focus on:
1. What type of agreement this is and between whom. CRITICAL: Use the ACTUAL FULL LEGAL NAMES of the parties as they appear in the preamble (e.g., "Digital Innovation LLC", "Javier Varisco"), NOT the defined terms (e.g., "Client", "Consultant") and NOT generic descriptions (e.g., "a biotech company"). If the party is a natural person, use their full name. If it's a company, use the complete legal entity name.
2. Key terms, obligations, or important dates
3. Notable amendments or changes (if any). IMPORTANT: Distinguish between formal amendments and side letters. Side letters are NOT amendments. For example: "Amended twice and modified by one side letter" NOT "Three amendments applied".

Return as a JSON list of 3 strings. Example:
["Consulting agreement between Acme Corp and Javier Varisco", "Monthly fee of $5,000 with 30-day payment terms", "Amended twice and modified by one side letter"]
"""

class BulletSummaryResponse(BaseModel):
    bullets: List[str]

def generate_bullet_summary(clauses: List[Dict], amendments: List[Dict], parties: List[str] = None) -> List[str]:
    """Generate a 3-bullet summary for dashboard hover preview."""
    # Build context from clauses and amendments
    clause_summary = []
    for clause in clauses[:5]:  # First 5 clauses for context
        clause_summary.append({
            "header": clause.get("header", ""),
            "text": clause.get("text", "")[:200]  # First 200 chars
        })

    amendment_info = [
        {
            "filename": a.get("filename", ""),
            "date": a.get("upload_timestamp", ""),
            "description": a.get("description", "")
        }
        for a in amendments
    ]

    side_letters = [a for a in amendment_info if "side letter" in a.get("description", "").lower()]
    formal_amendments = [a for a in amendment_info if "side letter" not in a.get("description", "").lower()]

    # Include party names if provided
    parties_text = ""
    if parties and len(parties) > 0:
        parties_text = f"\nPARTY NAMES (use these exact names):\n{json.dumps(parties, indent=2)}\n"

    context = f"""
CONTRACT CLAUSES:
{json.dumps(clause_summary, indent=2)}
{parties_text}
DOCUMENTS ({len(formal_amendments)} formal amendments, {len(side_letters)} side letters):
{json.dumps(amendment_info, indent=2)}
"""
    
    try:
        response = _gemini_generate_with_retry(
            model="models/gemini-2.5-flash",
            contents=[context],
            config=types.GenerateContentConfig(
                system_instruction=BULLET_SUMMARY_PROMPT,
                response_mime_type="application/json",
                response_schema=BulletSummaryResponse
            )
        )
        if response.parsed:
            return response.parsed.bullets[:3]  # Ensure max 3 bullets
        return ["Summary not available"]
    except Exception as e:
        print(f"Bullet summary generation error: {e}")
        return ["Unable to generate summary"]
# --- Date Extraction ---

DATE_PROMPT = """
Extract ONLY the effective date or signing date from this contract text.
The date should be the date the agreement was first created/signed.
Format the date as YYYY-MM-DD if possible. 
If no clear date is found, return null.
Return ONLY the date string or null.
"""

class DateResponse(BaseModel):
    date: str | None

def extract_original_date(clauses: List[Dict]) -> str | None:
    """Extract the effective date from preamble/first clause."""
    text = ""
    for clause in clauses:
        if clause.get('id') == 'preamble' or 'preamble' in clause.get('header', '').lower():
            text = clause.get('text', '')
            break
    
    if not text and clauses:
        text = clauses[0].get('text', '')
    
    if not text:
        return None
    
    try:
        response = _gemini_generate_with_retry(
            model="models/gemini-2.5-flash",
            contents=[f"Contract text:\n{text[:1000]}"],
            config=types.GenerateContentConfig(
                system_instruction=DATE_PROMPT,
                response_mime_type="application/json",
                response_schema=DateResponse
            )
        )
        if response.parsed:
            return response.parsed.date
        return None
    except Exception as e:
        print(f"Date extraction error: {e}")
        return None
