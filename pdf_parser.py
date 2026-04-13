"""
PDF Parser — Extracts text and tabular data from audited financial statement PDFs.
Uses Gemini File API for native document understanding.
"""

import io
import os
import re
import time


_MIME_MAP = {
    ".pdf":  "application/pdf",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xls":  "application/vnd.ms-excel",
    ".csv":  "text/csv",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".doc":  "application/msword",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".ppt":  "application/vnd.ms-powerpoint",
    ".txt":  "text/plain",
    ".png":  "image/png",
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif":  "image/gif",
}


def _upload_to_gemini(filepath: str, max_retries: int = 3) -> str:
    """
    Uploads a file to Gemini's File API with explicit MIME type resolution.
    Returns the file reference (e.g. 'files/abcdef123').
    Includes retry logic for cloud deployment resilience.
    """
    from google import genai
    from config import GEMINI_API_KEY

    client = genai.Client(api_key=GEMINI_API_KEY)
    basename = os.path.basename(filepath)
    ext = os.path.splitext(basename)[1].lower()
    mime_type = _MIME_MAP.get(ext, "application/octet-stream")
    print(f"  📤 Uploading {basename} ({mime_type}) to Gemini File API...")

    for attempt in range(max_retries):
        try:
            uploaded_file = client.files.upload(file=filepath, config={"mime_type": mime_type})

            # Wait until processing is complete (with timeout)
            wait_start = time.time()
            while uploaded_file.state == "PROCESSING":
                if time.time() - wait_start > 120:  # 2 min timeout
                    raise TimeoutError(f"File {basename} stuck in PROCESSING state for > 2 min")
                time.sleep(3)
                uploaded_file = client.files.get(name=uploaded_file.name)

            if hasattr(uploaded_file, 'state') and uploaded_file.state == "FAILED":
                raise RuntimeError(f"Gemini rejected file {basename}: processing failed")

            print(f"    ✅ Uploaded as {uploaded_file.name}")
            return uploaded_file.name

        except Exception as e:
            if attempt < max_retries - 1:
                wait = (attempt + 1) * 5
                print(f"    ⚠️  Upload attempt {attempt + 1} failed for {basename}: {e}")
                print(f"    ⏳ Retrying in {wait}s...")
                time.sleep(wait)
            else:
                raise RuntimeError(f"Failed to upload {basename} after {max_retries} attempts: {e}")


def _detect_company_name_from_pdf(filepath: str) -> str | None:
    """
    Try to quickly extract the company name from a PDF via pdfplumber.
    Falls back gracefully if pdfplumber can't handle the file (scanned PDFs).
    """
    try:
        import pdfplumber
        with pdfplumber.open(filepath) as pdf:
            # Check if it's a scanned PDF (very little extractable text)
            text_chars = 0
            pages_to_check = min(3, len(pdf.pages))
            for i in range(pages_to_check):
                text = pdf.pages[i].extract_text() or ""
                text_chars += len(text.strip())

            if text_chars < 50:
                return None  # Scanned PDF — can't skim locally

            # Skim first few pages for company name
            for i, page in enumerate(pdf.pages):
                if i > 3:
                    break
                text = page.extract_text() or ""
                name = _detect_company_name(text)
                if name:
                    return name
    except Exception as e:
        print(f"    ⚠️  pdfplumber skimming failed for {os.path.basename(filepath)}: {e}")

    return None


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
            "full_text":    str (heuristic skimmed, may be empty for scanned PDFs),
            "gemini_files": list[str] (list of uploaded Gemini file references)
        }
    """
    company_name = None
    combined_text = []
    gemini_files = []

    for fp in filepaths:
        print(f"  📄 Processing: {os.path.basename(fp)}")

        # Quick local skim for company name (best-effort)
        if not company_name:
            company_name = _detect_company_name_from_pdf(fp)

        # Upload to Gemini natively (the real extraction power)
        gemini_file_ref = _upload_to_gemini(fp)
        gemini_files.append(gemini_file_ref)

    return {
        "company_name": company_name or "Unknown Company",
        "full_text": "",
        "gemini_files": gemini_files
    }
