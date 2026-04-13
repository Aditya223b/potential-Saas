"""
AI Analyzer — Uses Google Gemini to perform comprehensive financial analysis.
Extracts structured data from PDFs, performs background & competitor research,
and generates investment recommendations.
"""

import json
import re
import time
from google import genai
from google.genai import errors as genai_errors
from config import GEMINI_API_KEY

# Configure Gemini client
_client = genai.Client(api_key=GEMINI_API_KEY)
_MODEL_PRIMARY = "gemini-2.5-pro"
_MODEL_FALLBACK = "gemini-2.5-flash"


def _generate_with_files(prompt: str, file_refs: list[str]) -> str:
    """Send a prompt with uploaded file references to Gemini."""
    models = [_MODEL_PRIMARY, _MODEL_FALLBACK]

    # Fetch file objects
    file_objs = []
    if file_refs:
        for ref in file_refs:
            try:
                file_objs.append(_client.files.get(name=ref))
            except Exception as e:
                print(f"Warning: could not retrieve file {ref}: {e}")

    contents = [*file_objs, prompt] if file_objs else prompt

    for model in models:
        for attempt in range(3):
            try:
                response = _client.models.generate_content(model=model, contents=contents)
                return response.text
            except (genai_errors.ServerError, genai_errors.ClientError) as e:
                err_str = str(e)
                is_retryable = "503" in err_str or "429" in err_str or "UNAVAILABLE" in err_str or "RESOURCE_EXHAUSTED" in err_str
                if is_retryable and attempt < 2:
                    wait = (attempt + 1) * 5
                    print(f"   ⏳ {model} unavailable, retrying in {wait}s (attempt {attempt + 1}/3)...")
                    time.sleep(wait)
                    continue
                elif is_retryable and model == _MODEL_PRIMARY:
                    print(f"   ⚠️  {model} unavailable, falling back to {_MODEL_FALLBACK}...")
                    break  # try fallback model
                else:
                    raise

    raise RuntimeError(f"All Gemini models unavailable after retries.")


def _generate(prompt: str) -> str:
    return _generate_with_files(prompt, [])


def _parse_json_response(text: str) -> dict:
    """Extract JSON from a Gemini response (handles markdown fences)."""
    # Try to find JSON block in markdown code fences
    json_match = re.search(r"```(?:json)?\s*\n(.*?)```", text, re.DOTALL)
    if json_match:
        text = json_match.group(1)

    # Clean up potential issues
    text = text.strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Try to extract just the JSON object
        brace_start = text.find("{")
        brace_end = text.rfind("}") + 1
        if brace_start >= 0 and brace_end > brace_start:
            try:
                return json.loads(text[brace_start:brace_end])
            except json.JSONDecodeError:
                pass
        return {"raw_response": text, "error": "Failed to parse JSON"}


def extract_financial_figures(gemini_files: list[str]) -> dict:
    """
    Use Gemini to extract key financial figures natively from the PDFs.
    Returns a structured dict with MULTI-YEAR data for comparison.
    """

    prompt = f"""You are an expert financial analyst. Analyze the attached financial statement PDF documents.

CRITICAL: Extract financial figures for ALL AVAILABLE YEARS. These documents may contain:
- FY2024-25 (year ending March 2025) data
- FY2023-24 (year ending March 2024) data
- Previous year comparatives

Look for:
- T-format balance sheets may show "Opening Capital" which is the PRIOR YEAR equity
- Audited statements often include both current and previous year columns
- Scanned documents may contain multiple years of data
- The documents may span different fiscal years — extract ALL of them

Return a JSON object organized BY YEAR with these keys for EACH year found:

{{
    "years_found": ["FY2025", "FY2024"],
    "FY2025": {{
        "year_label": "FY2024-25 (ending Mar 2025)",
        "currency": "INR",
        "scale_note": "describe conversions",
        
        "revenue": 0,
        "other_income": 0,
        "total_income": 0,
        "cost_of_materials": 0,
        "employee_expense": 0,
        "depreciation": 0,
        "finance_cost": 0,
        "other_expenses": 0,
        "total_expenses": 0,
        "profit_before_tax": 0,
        "tax_expense": 0,
        "net_profit": 0,
        "ebitda": 0,
        
        "share_capital": 0,
        "reserves": 0,
        "equity": 0,
        "long_term_borrowings": 0,
        "short_term_borrowings": 0,
        "total_debt": 0,
        "trade_payables": 0,
        "other_current_liabilities": 0,
        "short_term_provisions": 0,
        "current_liabilities_total": 0,
        
        "tangible_assets": 0,
        "trade_receivables": 0,
        "cash_and_equivalents": 0,
        "inventories": 0,
        "short_term_loans_advances": 0,
        "other_current_assets": 0,
        "current_assets_total": 0,
        "total_assets": 0,
        "working_capital": 0,
        
        "operating_cash_flow": 0,
        "investing_cash_flow": 0,
        "financing_cash_flow": 0
    }},
    "FY2024": {{
        ... same structure ...
    }},
    "sources": {{
        "FY2025": {{
            "revenue": {{
                "source_file": "name of uploaded file where this value was found",
                "page_number": 1,
                "excerpt": "short line or table row showing the value in context"
            }}
        }},
        "FY2024": {{
            "...": {{
                "source_file": "file name",
                "page_number": 1,
                "excerpt": "supporting excerpt"
            }}
        }}
    }}
}}

IMPORTANT NOTES:
- If a value cannot be found for a year, use null, but output 0 if it is explicitly zero.
- If interest/finance cost is present in the P&L, extract it — do NOT set it to 0 if loans exist.
- All values should be in BASE CURRENCY UNITS (Rupees, not Lakhs/Crores) — convert if needed.
  For example: 1,62,65,555 in Indian numbering = 16265555 rupees.
- `reserves` = Reserves & Surplus (or Net Worth minus share capital). This is CRITICAL.
- `equity` = Equity Share Capital + Reserves & Surplus.
- `total_debt` = long_term_borrowings + short_term_borrowings.
- For every extracted numeric field, populate `sources` with the best supporting file name, page number, and excerpt.
- Keep each `excerpt` short and table-oriented so it can be used to render a source preview for analyst verification.

Return ONLY the JSON object, no explanation.
"""

    raw_response = _generate_with_files(prompt, gemini_files)
    return _parse_json_response(raw_response)


def analyze_company_background(company_name: str, gemini_files: list[str], web_data: str) -> dict:
    """
    Generate company background research combining attached PDF files and web scraping results.
    """

    prompt = f"""You are a financial research analyst. Based on the attached financial reports and the external web data, provide a comprehensive company background analysis.

CRITICAL SECTOR CLASSIFICATION RULE:
- Determine the company's industry and sector ONLY from the actual products, services, and business activities described in the financial statements and website data.
- Do NOT guess the sector from the company name alone.
- For example, a company doing environmental testing, dynamic/climatic/fluid testing for defence and aerospace is in the "Testing, Inspection & Certification (TIC)" sector — NOT pharmaceutical CRO or biotech.
- Always look at what the company ACTUALLY DOES, not what their name might suggest.

Company Name: {company_name}

=== DATA FROM COMPANY WEBSITE ===
{web_data[:5000]}

Return a JSON object with this EXACT structure:
{{
    "company_name": "{company_name}",
    "legal_name": "Full registered name",
    "industry": "Primary industry/sector (based on actual business activities, NOT name)",
    "sub_industry": "Specific sub-sector (based on actual services provided)",
    "incorporation": "Year/details of incorporation if found",
    "headquarters": "Location",
    "key_products_services": ["Product/Service 1", "Product/Service 2", ...],
    "key_management": ["Name - Title", ...],
    "recent_milestones": ["Milestone 1", "Milestone 2", ...],
    "company_description": "2-3 paragraph description of the company",
    "business_model": "Brief description of how the company makes money",
    "market_position": "Description of market positioning"
}}

If any field is unknown, use "Not available from provided data". Return ONLY the JSON.
"""

    raw_response = _generate_with_files(prompt, gemini_files)
    return _parse_json_response(raw_response)


def analyze_competitors(company_name: str, industry: str, competitor_web_data: list[dict]) -> dict:
    """
    Analyze competitors based on scraped competitor website data.
    """

    competitors_text = ""
    for i, comp in enumerate(competitor_web_data):
        competitors_text += f"\n--- Competitor {i+1} ---\n"
        competitors_text += f"URL: {comp.get('url', 'N/A')}\n"
        competitors_text += f"Title: {comp.get('title', 'N/A')}\n"
        competitors_text += f"Content: {comp.get('content', 'N/A')[:2000]}\n"

    prompt = f"""You are a competitive intelligence analyst. Analyze the competitors of {company_name} in the {industry} industry.

IMPORTANT: Find competitors that operate in the SAME specific sector as {company_name}.
The industry has been determined as "{industry}" based on the company's actual business activities.
Find real competitors in this exact sector — do NOT use unrelated companies from different industries.

=== COMPETITOR WEBSITE DATA ===
{competitors_text[:8000]}

Based on this data and your knowledge, return a JSON object:
{{
    "industry_overview": "Brief overview of the industry landscape",
    "competitors": [
        {{
            "name": "Competitor Name",
            "website": "URL",
            "description": "What they do",
            "strengths": ["Strength 1", "Strength 2"],
            "weaknesses": ["Weakness 1"],
            "market_position": "Leader/Challenger/Niche",
            "estimated_size": "Revenue or employee range if known"
        }}
    ],
    "competitive_advantages_of_{company_name.replace(' ', '_').lower()}": ["Advantage 1", "Advantage 2"],
    "competitive_threats": ["Threat 1", "Threat 2"],
    "market_share_analysis": "Brief analysis of market share distribution"
}}

Provide at least 3-5 competitors. Return ONLY the JSON.
"""

    return _parse_json_response(_generate(prompt))


def analyze_financials(company_name: str, gemini_files: list[str], financials: dict, ratios: dict) -> dict:
    """
    Deep financial analysis combining extracted figures, calculated ratios,
    and natively processing the attached statement text.
    """

    ratios_text = json.dumps(ratios, indent=2, default=str)

    prompt = f"""You are a senior financial analyst. Provide a comprehensive financial analysis for {company_name}.
Please consider the attached financial statements PDFs alongside the explicit extracted values below.

=== EXTRACTED FINANCIAL FIGURES ===
{json.dumps(financials, indent=2)}

=== CALCULATED RATIOS ===
{ratios_text[:5000]}

Return a JSON object:
{{
    "executive_summary": "3-4 sentence high-level summary of financial health",
    "revenue_analysis": {{
        "trend": "Growing/Declining/Stable",
        "observations": ["Observation 1", "Observation 2"],
        "yoy_growth": "X% if calculable"
    }},
    "expense_analysis": {{
        "trend": "Increasing/Decreasing/Stable",
        "major_expenses": ["Expense category and amount", ...],
        "observations": ["Observation 1", ...]
    }},
    "profitability_assessment": {{
        "overall": "Strong/Moderate/Weak",
        "observations": ["Observation 1", ...]
    }},
    "cash_flow_assessment": {{
        "overall": "Healthy/Concerning/Critical",
        "observations": ["Observation 1", ...]
    }},
    "balance_sheet_strength": {{
        "overall": "Strong/Moderate/Weak",
        "observations": ["Observation 1", ...]
    }},
    "key_highlights": ["Highlight 1", "Highlight 2", ...],
    "areas_of_concern": ["Concern 1", "Concern 2", ...]
}}

Return ONLY the JSON.
"""

    raw_response = _generate_with_files(prompt, gemini_files)
    return _parse_json_response(raw_response)


def analyze_risks_and_pros(company_name: str, financial_analysis: dict, competitor_analysis: dict, ratios: dict, growth_metrics: dict = None) -> dict:
    """
    Generate risk factors and investment pros/cons.
    """
    growth_section = ""
    if growth_metrics:
        growth_section = f"""

=== YEAR-OVER-YEAR GROWTH ({growth_metrics.get('comparison', '')}) ===
Revenue Growth: {growth_metrics.get('revenue_growth', 'N/A')}
Net Profit Growth: {growth_metrics.get('net_income_growth', 'N/A')}
Total Assets Growth: {growth_metrics.get('total_assets_growth', 'N/A')}
Equity Growth: {growth_metrics.get('equity_growth', 'N/A')}

IMPORTANT: Consider the growth trajectory carefully. A company with 400%+ revenue growth
and 170%+ profit growth has a very different risk profile than its current-year ratios alone
might suggest. Growth companies often carry temporary leverage that shrinks as revenue scales."""

    prompt = f"""You are an investment analyst evaluating {company_name} for investment potential.

=== FINANCIAL ANALYSIS ===
{json.dumps(financial_analysis, indent=2, default=str)[:5000]}

=== COMPETITOR ANALYSIS ===
{json.dumps(competitor_analysis, indent=2, default=str)[:3000]}

=== KEY RATIOS ===
{json.dumps(ratios, indent=2, default=str)[:3000]}
{growth_section}

Return a JSON object:
{{
    "risk_factors": [
        {{
            "category": "Market Risk / Operational Risk / Financial Risk / Regulatory Risk / Concentration Risk",
            "severity": "High / Medium / Low",
            "description": "Detailed description of the risk",
            "mitigation": "Possible mitigation strategies"
        }}
    ],
    "investment_pros": [
        {{
            "category": "Growth / Profitability / Market Position / Management / Financials",
            "strength": "Bullish",
            "description": "Why this is a positive for investors"
        }}
    ],
    "investment_cons": [
        {{
            "category": "Category",
            "severity": "High / Medium / Low",
            "description": "Why this is a concern for investors"
        }}
    ],
    "overall_risk_rating": "Low / Medium / High",
    "risk_summary": "2-3 sentence summary of the overall risk profile"
}}

Provide at least 5 risk factors and 5 investment pros. Return ONLY the JSON.
"""

    return _parse_json_response(_generate(prompt))


def generate_recommendation(
    company_name: str,
    financial_analysis: dict,
    competitor_analysis: dict,
    risk_analysis: dict,
    ratios: dict,
    growth_metrics: dict = None,
) -> dict:
    """
    Generate the final investment recommendation.
    """
    growth_section = ""
    if growth_metrics:
        growth_section = f"""

=== YEAR-OVER-YEAR GROWTH ({growth_metrics.get('comparison', '')}) ===
Revenue Growth: {growth_metrics.get('revenue_growth', 'N/A')}
Net Profit Growth: {growth_metrics.get('net_profit_growth', 'N/A')}
Total Assets Growth: {growth_metrics.get('total_assets_growth', 'N/A')}
Equity Growth: {growth_metrics.get('equity_growth', 'N/A')}

IMPORTANT: Factor in the growth trajectory when making your recommendation.
A company showing explosive growth (e.g., 400%+ revenue) while remaining profitable
is fundamentally different from a stagnant company with similar debt ratios.
High leverage combined with rapid revenue scaling may warrant "CONDITIONAL APPROVAL"
or "BUY" with conditions, rather than "AVOID"."""

    prompt = f"""You are a senior investment advisor providing a final recommendation on {company_name}.

=== FINANCIAL HEALTH ===
{json.dumps(financial_analysis, indent=2, default=str)[:4000]}

=== COMPETITIVE POSITION ===
{json.dumps(competitor_analysis, indent=2, default=str)[:3000]}

=== RISK ASSESSMENT ===
{json.dumps(risk_analysis, indent=2, default=str)[:3000]}

=== KEY RATIOS ===
{json.dumps(ratios, indent=2, default=str)[:2000]}
{growth_section}

Provide your investment recommendation. Return a JSON object:
{{
    "recommendation": "BUY / CONDITIONAL APPROVAL / HOLD / SELL / AVOID",
    "confidence_level": "High / Medium / Low",
    "target_horizon": "Short-term (< 1 year) / Medium-term (1-3 years) / Long-term (3+ years)",
    "summary": "3-5 sentence executive recommendation summary",
    "key_reasons": ["Reason 1", "Reason 2", "Reason 3"],
    "caveats": ["Caveat 1", "Caveat 2"],
    "conditions": ["Condition for approval 1", "Condition 2"],
    "suitable_for": "Type of investor this is suitable for",
    "detailed_rationale": "2-3 paragraph detailed rationale for the recommendation"
}}

Return ONLY the JSON.
"""

    return _parse_json_response(_generate(prompt))


def run_full_analysis(
    company_name: str,
    gemini_files: list[str],
    web_data: str,
    competitor_web_data: list[dict],
) -> dict:
    """
    Run the complete AI analysis pipeline utilizing native files.

    Returns a dict with all analysis sections.
    """
    print("\n🤖 Step 1/6: Extracting financial figures...")
    raw_financials = extract_financial_figures(gemini_files)
    financials = _get_multi_year_financials(raw_financials)
    years = financials.get("years_found", [])
    print(f"   ✅ Extracted financials for {len(years)} year(s): {', '.join(years)}")

    print("🤖 Step 2/6: Company background research...")
    background = analyze_company_background(company_name, gemini_files, web_data)
    print(f"   ✅ Company background complete")

    industry = background.get("industry", "Unknown")

    print("🤖 Step 3/6: Competitor analysis...")
    competitors = analyze_competitors(company_name, industry, competitor_web_data)
    print(f"   ✅ Competitor analysis complete")

    # Calculate ratios for each year
    computed_ratios = _compute_multi_year_ratios(financials)
    growth_metrics = _compute_growth_metrics(financials)

    if growth_metrics:
        print(f"   📈 Growth: Revenue {growth_metrics.get('revenue_growth', 'N/A')}, "
              f"Profit {growth_metrics.get('net_profit_growth', 'N/A')}")

    print("🤖 Step 4/6: Financial analysis...")
    financial_analysis = analyze_financials(company_name, gemini_files, financials, computed_ratios)
    print(f"   ✅ Financial analysis complete")

    print("🤖 Step 5/6: Risk factors & investment pros...")
    risk_analysis = analyze_risks_and_pros(company_name, financial_analysis, competitors, computed_ratios, growth_metrics)
    print(f"   ✅ Risk assessment complete")

    print("🤖 Step 6/6: Generating recommendation...")
    recommendation = generate_recommendation(
        company_name, financial_analysis, competitors, risk_analysis, computed_ratios, growth_metrics
    )
    print(f"   ✅ Recommendation: {recommendation.get('recommendation', 'N/A')}")

    return {
        "company_name": company_name,
        "financials": financials,
        "computed_ratios": computed_ratios,
        "growth_metrics": growth_metrics,
        "company_background": background,
        "competitor_analysis": competitors,
        "financial_analysis": financial_analysis,
        "risk_analysis": risk_analysis,
        "recommendation": recommendation,
    }


def _get_multi_year_financials(raw_financials: dict) -> dict:
    """
    Normalize the extraction result.
    If multi-year format (has 'years_found'), return as-is.
    If legacy single-year format, wrap it in a multi-year structure.
    """
    if "years_found" in raw_financials:
        return raw_financials

    # Legacy single-year → wrap as latest year
    return {
        "years_found": ["FY2025"],
        "FY2025": raw_financials,
    }


def _compute_multi_year_ratios(financials: dict) -> dict:
    """Calculate ratios for each year and merge into a combined structure."""
    from ratios import calculate_all_ratios

    years = financials.get("years_found", [])
    all_ratios = {}

    for year in years:
        year_data = financials.get(year, {})
        if not year_data or isinstance(year_data, list):
            continue
        year_ratios = calculate_all_ratios(year_data)
        all_ratios[year] = year_ratios

    return all_ratios


def _compute_growth_metrics(financials: dict) -> dict:
    """Calculate YoY growth rates if multi-year data is available."""
    years = financials.get("years_found", [])
    if len(years) < 2:
        return {}

    # Sort years so we compare latest vs prior
    sorted_years = sorted(years, reverse=True)
    latest = financials.get(sorted_years[0], {})
    prior = financials.get(sorted_years[1], {})

    def pct(curr, prev):
        try:
            c, p = float(curr or 0), float(prev or 0)
            if p == 0:
                return "N/A"
            return f"{((c - p) / abs(p)) * 100:.1f}%"
        except (ValueError, TypeError):
            return "N/A"

    return {
        "comparison": f"{sorted_years[0]} vs {sorted_years[1]}",
        "revenue_growth": pct(latest.get("revenue"), prior.get("revenue")),
        "net_profit_growth": pct(latest.get("net_profit"), prior.get("net_profit")),
        "total_assets_growth": pct(latest.get("total_assets"), prior.get("total_assets")),
        "equity_growth": pct(latest.get("equity"), prior.get("equity")),
    }
