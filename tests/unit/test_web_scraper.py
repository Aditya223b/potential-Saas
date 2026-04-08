import pytest
from unittest.mock import MagicMock, patch
from web_scraper import search_company_website, scrape_page, scrape_about_page, scrape_company_info

# ─── Mock HTML Content ───
MOCK_GOOGLE_SEARCH = """
<html>
  <a href="/url?q=https://www.targetcompany.com&sa=U">Target Company Official Site</a>
  <a href="/url?q=https://www.wikipedia.org/wiki/Target&sa=U">Wikipedia</a>
  <a href="/url?q=https://www.facebook.com/Target&sa=U">Facebook</a>
</html>
"""

MOCK_HOMEPAGE = """
<html>
  <head>
    <title>Target Company | Excellence</title>
    <meta name="description" content="Leading provider of financial services.">
  </head>
  <body>
    <main>
      <h1>Welcome to Target</h1>
      <p>Standard text content that should be extracted.</p>
    </main>
    <footer>Noise that should be removed.</footer>
  </body>
</html>
"""

# ─── Tests ───

@patch("requests.get")
def test_search_company_website_filtering(mock_get):
    """Case 31, 38: Successful Google search and domain filtering (skips Wikipedia/Facebook)."""
    mock_resp = MagicMock()
    mock_resp.text = MOCK_GOOGLE_SEARCH
    mock_resp.status_code = 200
    mock_get.return_value = mock_resp
    
    url = search_company_website("Target")
    
    # Assert it picked the first non-skipped domain
    assert url == "https://www.targetcompany.com"
    assert "google.com" in mock_get.call_args[0][0]

@patch("requests.get")
def test_scrape_page_content_extraction(mock_get):
    """Case 32, 34: Extraction of Title, Meta, and Main content without noise."""
    mock_resp = MagicMock()
    mock_resp.text = MOCK_HOMEPAGE
    mock_resp.status_code = 200
    mock_get.return_value = mock_resp
    
    result = scrape_page("https://test.com")
    
    assert result["title"] == "Target Company | Excellence"
    assert result["description"] == "Leading provider of financial services."
    assert "Standard text content" in result["content"]
    assert "Noise that should be removed" not in result["content"]

@patch("requests.get")
def test_scrape_page_max_chars(mock_get):
    """Case 38: Max characters limit enforcement."""
    mock_resp = MagicMock()
    mock_resp.text = "<html><body>" + ("A" * 1000) + "</body></html>"
    mock_resp.status_code = 200
    mock_get.return_value = mock_resp
    
    result = scrape_page("https://test.com", max_chars=10)
    assert len(result["content"]) == 10

@patch("requests.head")
@patch("web_scraper.scrape_page")
def test_scrape_about_page_discovery(mock_scrape, mock_head):
    """Case 35: Discovery of 'About' page via common paths."""
    # Fail /about, succeed /about-us
    mock_head.side_effect = [
        MagicMock(status_code=404),
        MagicMock(status_code=200)
    ]
    mock_scrape.return_value = {"content": "About us text"}
    
    result = scrape_about_page("https://target.com")
    
    assert result["content"] == "About us text"
    # Verify it tried the paths
    assert mock_head.call_count == 2

@patch("requests.get")
def test_scraper_blocking_handling(mock_get):
    """Case 32: Proceed gracefully when Google or site returns 429/403."""
    mock_get.side_effect = Exception("HTTP 429 Too Many Requests")
    
    url = search_company_website("Target")
    assert url is None # Should not crash, just return None

@patch("web_scraper.search_company_website", return_value=None)
def test_scrape_company_info_no_site_fallback(mock_search):
    """Case 40: Fallback text when no website is found."""
    result = scrape_company_info("Unknown Company")
    assert "No website found" in result["raw_data"]
    assert result["website_url"] is None

@patch("requests.get")
def test_scraper_403_forbidden_handling(mock_get):
    """Case 145, 146: DuckDuckGo blocks scraping with 403 Forbidden."""
    mock_resp = MagicMock()
    mock_resp.status_code = 403
    mock_get.return_value = mock_resp
    
    url = search_company_website("BLOCKED CO")
    assert url is None # Handled gracefully

@patch("requests.get")
def test_scrape_infinite_redirects(mock_get):
    """Case 147, 148: Site traps scraper in infinite redirects."""
    import requests
    mock_get.side_effect = requests.exceptions.TooManyRedirects("Infinite loop")
    
    result = scrape_page("https://trap.com")
    assert "Infinite loop" in result["content"]

@patch("requests.get")
def test_scrape_wikipedia_fallback(mock_get):
    """Case 149, 150: The only results returned are explicitly blocked domains."""
    mock_resp = MagicMock()
    # It finds Wikipedia, Facebook, LinkedIn, but nothing else.
    mock_resp.text = '<html><a href="/url?q=https://www.wikipedia.org/wiki/Target&sa=U">Wiki</a></html>'
    mock_resp.status_code = 200
    mock_get.return_value = mock_resp
    
    url = search_company_website("Just Wiki")
    assert url is None
