"""
PDF Parser — Extracts text and tabular data from audited financial statement PDFs.
Uses pdfplumber for text-based PDFs and Gemini Vision for scanned/image PDFs.
"""

import io
import os
import re
import pdfplumber
from PIL import Image


def _is_scanned_pdf(pdf) -> bool:
    """Check if a PDF is image-based (scanned) by testing the first few pages."""
    text_chars = 0
    pages_to_check = min(3, len(pdf.pages))
    for i in range(pages_to_check):
        text = pdf.pages[i].extract_text() or ""
        text_chars += len(text.strip())
    return text_chars < 50


def _upload_to_gemini(filepath: str) -> str:
    """
    Uploads a PDF securely to Gemini's internal structured File API.
    Returns the file reference (e.g. 'files/abcdef123').
    """
    from google import genai
    import time
    from config import GEMINI_API_KEY
    
    client = genai.Client(api_key=GEMINI_API_KEY)
    print(f"  📤 Uploading {os.path.basename(filepath)} to Gemini File API natively...")
    uploaded_file = client.files.upload(file=filepath)
    
    # Wait until processing is complete
    while uploaded_file.state == "PROCESSING":
        time.sleep(2)
        uploaded_file = client.files.get(name=uploaded_file.name)
        
    print(f"    ✅ Uploaded as {uploaded_file.name}")
    return uploaded_file.name
    for i in range(pages_to_check):
        text = pdf.pages[i].extract_text() or ""
        text_chars += len(text.strip())
    return text_chars < 50  # Less than 50 chars across first 3 pages = likely scanned


def parse_financial_pdf(filepath: str) -> dict:
    """
    Parse a financial statement PDF very quickly for heuristic text (company name).
    It no longer attempts brutal force OCR, it just skims.
    """
    company_name = None
    full_text_parts = []

    try:
        with pdfplumber.open(filepath) as pdf:
            if not _is_scanned_pdf(pdf):
                for i, page in enumerate(pdf.pages):
                    if i > 5: break # Only skim first few pages for names to save time
                    text = page.extract_text() or ""
                    full_text_parts.append(text)
                    if not company_name:
                        company_name = _detect_company_name(text)
    except Exception as e:
        print(f"    ⚠️  Fast skimming failed for {filepath}: {e}")

    return {
        "filepath": filepath,
        "company_name": company_name,
        "full_text": "\n\n".join(full_text_parts)
    }


def _detect_company_name(text: str) -> str | None:
    """
    Heuristic: try to extract the company name from the first page header.
    """
    patterns = [
        r"([\w\s&.'-]+(?:Private\s+)?(?:Limited|Ltd\.?|Corporation|Inc\.?|LLP|Pvt\.?\s*Ltd\.?))",
        r"([\w\s&.'-]+(?:Labs?|Technologies|Solutions|Enterprises|Industries|Services)(?:\s+(?:Private\s+)?(?:Limited|Ltd\.?|LLP))?)",
    ]

    for pattern in patterns:
        match = re.search(pattern, text[:500], re.IGNORECASE)
        if match:
            name = match.group(1).strip()
            if len(name) > 3 and not name.lower().startswith(("balance", "profit", "statement", "audit", "---")):
                return name

    # Fallback: first non-empty line
    for line in text.split("\n"):
        line = line.strip()
        if line and len(line) > 3 and not line.lower().startswith(("balance", "profit", "statement", "schedule", "---")):
            return line[:100]

    return None


def parse_multiple_pdfs(filepaths: list[str]) -> dict:
    """
    Parse multiple PDFs natively using Gemini File API.
    
    Returns:
        {
            "company_name": str,
            "full_text":    str (heuristic skimmed),
            "gemini_files": list[str] (list of uploaded file names)
        }
    """
    company_name = None
    combined_text = []
    gemini_files = []

    for fp in filepaths:
        print(f"  📄 Processing: {fp}")
        
        # Fast skim for text/company name
        result = parse_financial_pdf(fp)
        if not company_name and result["company_name"]:
            company_name = result["company_name"]
            
        combined_text.append(result.get("full_text", ""))
        
        # Substantially upload to Gemini
        gemini_file_ref = _upload_to_gemini(fp)
        gemini_files.append(gemini_file_ref)

    return {
        "company_name": company_name or "Unknown Company",
        "full_text": "\n\n--- NEXT DOCUMENT ---\n\n".join(combined_text),
        "gemini_files": gemini_files
    }
