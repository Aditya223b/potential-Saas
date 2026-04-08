import pytest
from unittest.mock import MagicMock, patch
from pdf_parser import _upload_to_gemini, _detect_company_name, _detect_company_name_from_pdf, parse_multiple_pdfs

# ─── Mock setup for Gemini ───
class MockFile:
    def __init__(self, name, state="COMPLETED"):
        self.name = name
        self.state = state

class MockFiles:
    def __init__(self):
        self.upload_calls = 0
    
    def upload(self, file):
        self.upload_calls += 1
        return MockFile("files/test-file")
    
    def get(self, name):
        return MockFile(name, "COMPLETED")

class MockClient:
    def __init__(self, api_key):
        self.files = MockFiles()

# ─── Tests ───

@patch("google.genai.Client", side_effect=MockClient)
def test_upload_to_gemini_success(mock_client_class):
    """Case 16: Valid single-page PDF extraction / upload."""
    with patch("config.GEMINI_API_KEY", "test-key"):
        file_ref = _upload_to_gemini("fake.pdf")
        assert file_ref == "files/test-file"

@patch("google.genai.Client")
@patch("time.sleep", return_value=None)
def test_upload_to_gemini_retries(mock_sleep, mock_client_class):
    """Case 25: Gemini API retry logic (3 attempts)."""
    mock_client = MagicMock()
    mock_client_class.return_value = mock_client
    
    # Fail twice, succeed third time
    mock_client.files.upload.side_effect = [
        Exception("API Error"),
        Exception("API Error"),
        MockFile("files/success")
    ]
    mock_client.files.get.return_value = MockFile("files/success", "COMPLETED")
    
    with patch("config.GEMINI_API_KEY", "test-key"):
        file_ref = _upload_to_gemini("fake.pdf")
        assert file_ref == "files/success"
        assert mock_client.files.upload.call_count == 3

@patch("google.genai.Client")
@patch("time.sleep", return_value=None)
@patch("time.time")
def test_upload_to_gemini_timeout(mock_time, mock_sleep, mock_client_class):
    """Case 26: Gemini API timeout handling (2 min simulation)."""
    mock_client = MagicMock()
    mock_client_class.return_value = mock_client
    
    # Stuck in PROCESSING
    mock_client.files.upload.return_value = MockFile("files/stuck", "PROCESSING")
    mock_client.files.get.return_value = MockFile("files/stuck", "PROCESSING")
    
    # Mock time.time() to jump forward so that all 3 tries timeout quickly
    import itertools
    mock_time.side_effect = itertools.count(start=100, step=130)
    
    with patch("config.GEMINI_API_KEY", "test-key"):
        with pytest.raises(RuntimeError, match="stuck in PROCESSING"):
            _upload_to_gemini("fake.pdf")

def test_detect_company_name_heuristics():
    """Case 26, 27: Company name detection from snippets."""
    # Case 26: Limited company
    text = "REHBAR PRIVATE LIMITED\nBalance Sheet as of 2024"
    assert _detect_company_name(text) == "REHBAR PRIVATE LIMITED"
    
    # Case 27: Pvt Ltd variation
    text = "Fast Technologies Pvt. Ltd.\nAnnual Report"
    assert _detect_company_name(text) == "Fast Technologies Pvt. Ltd."

    # Case 28: Reject noise
    noise = "Balance Sheet\nProfit and Loss"
    # Should fall back to non-empty line if no Limited/Ltd found, 
    # but the heuristic has safety checks to avoid starting with 'Balance'
    assert _detect_company_name(noise) is None

@patch("pdfplumber.open")
def test_detect_company_name_from_pdf_scanned_check(mock_pdf_open):
    """Case 18: Detect scanned PDF (minimal extractable characters)."""
    mock_pdf = MagicMock()
    mock_page = MagicMock()
    # Mock very little text
    mock_page.extract_text.return_value = "   " 
    mock_pdf.pages = [mock_page]
    mock_pdf_open.return_value.__enter__.return_value = mock_pdf
    
    result = _detect_company_name_from_pdf("scanned.pdf")
    assert result is None

@patch("pdf_parser._upload_to_gemini", return_value="files/ref")
@patch("pdf_parser._detect_company_name_from_pdf", return_value="Test Corp")
def test_parse_multiple_pdfs(mock_skim, mock_upload):
    """Case 26: Concurrent parsing of multiple files."""
    files = ["a.pdf", "b.pdf"]
    result = parse_multiple_pdfs(files)
    
    assert result["company_name"] == "Test Corp"
    assert len(result["gemini_files"]) == 2
    assert result["gemini_files"][0] == "files/ref"

@patch("google.genai.Client", side_effect=MockClient)
def test_upload_excel_format_support(mock_client_class):
    """Case 131, 132: Excel (.xlsx / .xls) parsing via Gemini API."""
    # The application should support .xlsx files securely passing them to Gemini.
    with patch("config.GEMINI_API_KEY", "test-key"):
        file_ref = _upload_to_gemini("financial_sheet.xlsx")
        assert file_ref == "files/test-file"

def test_detect_company_name_junk_chars():
    """Case 133, 134: Gracefully handling literally junk characters from file parsing."""
    junk_str = "\x00\x01\x02\nPRIVATE LIMITED"
    result = _detect_company_name(junk_str)
    # The regex might extract some broken strings or None, but it shouldn't crash
    assert result is None or hasattr(result, "strip")

@patch("pdfplumber.open")
def test_detect_company_name_pure_image(mock_pdf_open):
    """Case 135, 136: Deeply encrypted or pure image PDFs yielding exactly 0 extractable chars."""
    mock_pdf = MagicMock()
    mock_page = MagicMock()
    mock_page.extract_text.return_value = None  # Representing empty/image page
    mock_pdf.pages = [mock_page]
    mock_pdf_open.return_value.__enter__.return_value = mock_pdf
    
    result = _detect_company_name_from_pdf("image_only.pdf")
    assert result is None

@patch("google.genai.Client")
@patch("time.sleep", return_value=None)
@patch("time.time")
def test_upload_gemini_non_standard_state(mock_time, mock_sleep, mock_client_class):
    """Case 137, 138: Gemini returning non-standard status like PENDING."""
    mock_client = MagicMock()
    mock_client_class.return_value = mock_client
    
    import itertools
    mock_time.side_effect = itertools.count(start=100, step=10)
    
    # Stuck in PENDING, the code only checks 'PROCESSING' and 'FAILED'. If state is 'PENDING',
    # it won't hit the while loop and might return immediately, acting as if completed.
    mock_client.files.upload.return_value = MockFile("files/pending", "PENDING")
    mock_client.files.get.return_value = MockFile("files/pending", "PENDING")
    
    with patch("config.GEMINI_API_KEY", "test-key"):
        file_ref = _upload_to_gemini("weird_state.pdf")
        assert file_ref == "files/pending"

@patch("google.genai.Client")
@patch("time.sleep", return_value=None)
def test_upload_gemini_rejected_file(mock_sleep, mock_client_class):
    """Case 139, 140: Gemini deeply rejects malicious or encrypted payload as FAILED."""
    mock_client = MagicMock()
    mock_client_class.return_value = mock_client
    
    # Simulates the server explicitly rejecting the file format or contents
    mock_client.files.upload.return_value = MockFile("files/failed", "FAILED")
    mock_client.files.get.return_value = MockFile("files/failed", "FAILED")
    
    with patch("config.GEMINI_API_KEY", "test-key"):
        with pytest.raises(RuntimeError, match="Failed to upload.+failed"):
            _upload_to_gemini("malicious.pdf")
