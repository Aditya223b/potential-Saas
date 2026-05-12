"""
Web Scraper — Searches for and scrapes company & competitor websites
to gather background research data for the AI analysis.

Search strategy:
  1. SerpAPI (if SERPAPI_KEY is set) — works reliably from cloud IPs
  2. Google fallback (direct requests) — works locally but blocked on Railway/Render
"""

import re
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse

# Common headers to avoid bot blocking
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

TIMEOUT = 10  # seconds — keep short for cloud deployments

# Domains to always skip in search results
_SKIP_DOMAINS = [
    "google.", "youtube.", "wikipedia.", "facebook.",
    "twitter.", "linkedin.", "instagram.", "reddit.",
]


def _normalize_website_url(url: str) -> str:
    """Normalize a user-provided company website URL for scraping."""
    url = (url or "").strip()
    if not url:
        return ""

    parsed = urlparse(url)
    if not parsed.scheme:
        url = f"https://{url}"

    return url


# ── Search Functions (SerpAPI primary, Google fallback) ──────────────────────


def search_company_website(company_name: str) -> str | None:
    """
    Search for the company's official website URL.
    Uses SerpAPI when available, falls back to direct Google scraping.
    """
    from config import SERPAPI_KEY

    if SERPAPI_KEY:
        return _search_company_website_serpapi(company_name, SERPAPI_KEY)
    return _search_company_website_google(company_name)


def _search_company_website_serpapi(company_name: str, api_key: str) -> str | None:
    """Search via SerpAPI — reliable from cloud IPs."""
    query = f"{company_name} official website"
    try:
        resp = requests.get("https://serpapi.com/search.json", params={
            "q": query,
            "num": 5,
            "api_key": api_key,
            "engine": "google",
        }, timeout=TIMEOUT)
        resp.raise_for_status()
        data = resp.json()

        for result in data.get("organic_results", []):
            url = result.get("link", "")
            parsed = urlparse(url)
            if parsed.scheme in ("http", "https") and not any(d in parsed.netloc for d in _SKIP_DOMAINS):
                print(f"  🌐 SerpAPI found website: {url}")
                return url

    except Exception as e:
        print(f"  ⚠️  SerpAPI search failed for '{company_name}': {e}")

    return None


def _search_company_website_google(company_name: str) -> str | None:
    """Fallback: direct Google search (blocked on most cloud IPs)."""
    query = f"{company_name} official website"
    search_url = "https://www.google.com/search"
    params = {"q": query, "num": 5}

    try:
        resp = requests.get(search_url, params=params, headers=HEADERS, timeout=TIMEOUT, allow_redirects=True)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        for a_tag in soup.find_all("a", href=True):
            href = a_tag["href"]
            if "/url?q=" in href:
                url = href.split("/url?q=")[1].split("&")[0]
                parsed = urlparse(url)
                if parsed.scheme in ("http", "https") and not any(d in parsed.netloc for d in _SKIP_DOMAINS):
                    return url

    except Exception as e:
        print(f"  ⚠️  Google search failed for '{company_name}': {e}")

    return None


def scrape_page(url: str, max_chars: int = 5000) -> dict:
    """
    Scrape a single web page and extract useful text content.

    Returns:
        {
            "url":         str,
            "title":       str,
            "description": str,
            "content":     str (truncated to max_chars),
            "links":       list[str],
        }
    """
    result = {
        "url": url,
        "title": "",
        "description": "",
        "content": "",
        "links": [],
    }

    try:
        resp = requests.get(url, headers=HEADERS, timeout=TIMEOUT, allow_redirects=True)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        # Title
        title_tag = soup.find("title")
        result["title"] = title_tag.get_text(strip=True) if title_tag else ""

        # Meta description
        meta_desc = soup.find("meta", attrs={"name": "description"})
        if meta_desc and meta_desc.get("content"):
            result["description"] = meta_desc["content"].strip()

        # Remove script/style elements
        for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
            tag.decompose()

        # Extract main content
        main = soup.find("main") or soup.find("article") or soup.find("body")
        if main:
            text = main.get_text(separator="\n", strip=True)
            # Clean up excessive whitespace
            text = re.sub(r"\n{3,}", "\n\n", text)
            result["content"] = text[:max_chars]

        # Collect internal links
        base_domain = urlparse(url).netloc
        for a in soup.find_all("a", href=True):
            full_url = urljoin(url, a["href"])
            if base_domain in urlparse(full_url).netloc:
                result["links"].append(full_url)

    except Exception as e:
        result["content"] = f"[Scraping failed: {e}]"

    return result


def scrape_about_page(base_url: str) -> dict | None:
    """Try to find and scrape the company's About page."""
    common_paths = ["/about", "/about-us", "/about.html", "/company", "/who-we-are"]
    parsed = urlparse(base_url)
    base = f"{parsed.scheme}://{parsed.netloc}"

    for path in common_paths:
        try:
            url = base + path
            resp = requests.head(url, headers=HEADERS, timeout=5, allow_redirects=True)
            if resp.status_code == 200:
                return scrape_page(url)
        except Exception:
            continue

    return None


def scrape_company_info(company_name: str, website_url_override: str = "") -> dict:
    """
    Full pipeline: find the company website, scrape it, and gather
    background data for AI analysis.
    Designed to fail gracefully — web research is supplementary, never blocking.
    """
    result = {
        "company_name": company_name,
        "website_url": None,
        "homepage": {},
        "about_page": None,
        "raw_data": "",
    }

    try:
        website_url = _normalize_website_url(website_url_override)
        if website_url:
            print(f"  🌐 Using provided website for {company_name}: {website_url}")
        else:
            print(f"  🌐 Searching for {company_name} website...")
            website_url = search_company_website(company_name)

        result["website_url"] = website_url

        if not website_url:
            print(f"  ⚠️  Could not find website for {company_name} (may be blocked on cloud)")
            result["raw_data"] = f"No website found for {company_name}. Analysis will rely on financial statement data and AI knowledge."
            return result

        print(f"  🌐 Scraping homepage: {website_url}")
        homepage = scrape_page(website_url)
        result["homepage"] = homepage

        print(f"  🌐 Looking for About page...")
        about = scrape_about_page(website_url)
        result["about_page"] = about

        # Combine into a single text block for AI
        parts = [
            f"=== COMPANY WEBSITE: {company_name} ===",
            f"URL: {website_url}",
            f"Title: {homepage.get('title', '')}",
            f"Description: {homepage.get('description', '')}",
            f"\n--- Homepage Content ---\n{homepage.get('content', '')}",
        ]

        if about:
            parts.append(f"\n--- About Page ---\n{about.get('content', '')}")

        result["raw_data"] = "\n".join(parts)

    except Exception as e:
        print(f"  ⚠️  Web research failed (non-blocking): {e}")
        result["raw_data"] = f"Web research unavailable. Analysis will rely on financial statement data and AI knowledge."

    return result


def search_competitors(company_name: str, industry_hint: str = "") -> list[dict]:
    """
    Search for competitors and scrape their basic info.
    Uses SerpAPI when available, falls back to direct Google scraping.
    Designed to fail gracefully — competitor data is supplementary.
    """
    from config import SERPAPI_KEY

    if SERPAPI_KEY:
        return _search_competitors_serpapi(company_name, industry_hint, SERPAPI_KEY)
    return _search_competitors_google(company_name, industry_hint)


def _search_competitors_serpapi(company_name: str, industry_hint: str, api_key: str) -> list[dict]:
    """Search for competitors via SerpAPI — reliable from cloud IPs."""
    competitors = []
    query = f"{company_name} competitors {industry_hint}".strip()
    print(f"  🔍 Searching for competitors via SerpAPI: {query}")

    try:
        resp = requests.get("https://serpapi.com/search.json", params={
            "q": query,
            "num": 10,
            "api_key": api_key,
            "engine": "google",
        }, timeout=TIMEOUT)
        resp.raise_for_status()
        data = resp.json()

        found_urls = set()
        extra_skip = [company_name.lower().replace(" ", "")]

        for result in data.get("organic_results", []):
            url = result.get("link", "")
            parsed = urlparse(url)
            all_skip = _SKIP_DOMAINS + extra_skip

            if (
                parsed.scheme in ("http", "https")
                and not any(d in parsed.netloc.lower() for d in all_skip)
                and parsed.netloc not in found_urls
                and len(competitors) < 3
            ):
                found_urls.add(parsed.netloc)
                print(f"  🌐 Scraping competitor: {url}")
                page_data = scrape_page(url, max_chars=2000)
                competitors.append(page_data)

    except Exception as e:
        print(f"  ⚠️  SerpAPI competitor search failed (non-blocking): {e}")

    return competitors


def _search_competitors_google(company_name: str, industry_hint: str = "") -> list[dict]:
    """Fallback: direct Google search for competitors (blocked on cloud IPs)."""
    competitors = []

    try:
        query = f"{company_name} competitors {industry_hint}".strip()
        print(f"  🔍 Searching for competitors: {query}")

        search_url = "https://www.google.com/search"
        params = {"q": query, "num": 10}

        resp = requests.get(search_url, params=params, headers=HEADERS, timeout=TIMEOUT, allow_redirects=True)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        found_urls = set()

        for a_tag in soup.find_all("a", href=True):
            href = a_tag["href"]
            if "/url?q=" in href:
                url = href.split("/url?q=")[1].split("&")[0]
                parsed = urlparse(url)
                extra_skip = [company_name.lower().replace(" ", "")]
                all_skip = _SKIP_DOMAINS + extra_skip
                if (
                    parsed.scheme in ("http", "https")
                    and not any(d in parsed.netloc.lower() for d in all_skip)
                    and parsed.netloc not in found_urls
                    and len(competitors) < 3
                ):
                    found_urls.add(parsed.netloc)
                    print(f"  🌐 Scraping competitor: {url}")
                    page_data = scrape_page(url, max_chars=2000)
                    competitors.append(page_data)

    except Exception as e:
        print(f"  ⚠️  Competitor search failed (non-blocking): {e}")

    return competitors
