# 📊 Financial Statement Analysis Automation

AI-powered automation that analyzes audited financial statements and generates comprehensive investment analysis reports.

## What It Does

1. **Parses** audited financial statement PDFs (Balance Sheet, P&L, Cash Flow)
2. **Scrapes** the company's website and competitor websites for background research
3. **Extracts** key financial figures using Gemini AI
4. **Calculates** 20+ financial ratios (Liquidity, Profitability, R' Ratios, Solvency, Efficiency, Valuation)
5. **Analyzes** financials, risks, and investment potential using AI
6. **Generates** a professional DOCX report with tables and color-coded indicators
7. **Emails** the report to the specified recipient

## Quick Start

### 1. Setup

```bash
cd /Users/ranjan/Desktop/some/financial_analyzer

# Install dependencies
pip install -r requirements.txt

# Configure credentials
cp .env.example .env
# Edit .env and fill in:
#   - GEMINI_API_KEY (from https://aistudio.google.com/apikey)
#   - SMTP_EMAIL (your Gmail address)
#   - SMTP_APP_PASSWORD (from https://myaccount.google.com/apppasswords)
```

### 2. Run

```bash
# Analyze with email delivery
python main.py \
  --pdf "../DSRI FY24-25 Balance Sheet.pdf" "../DSRI FY24-25 P&L Statement.pdf" \
  --email "recipient@example.com"

# Generate report only (no email)
python main.py \
  --pdf "../DSRI FY24-25 Balance Sheet.pdf" \
  --no-email

# Custom output directory
python main.py \
  --pdf "statement.pdf" \
  --email "team@company.com" \
  --output-dir "./reports"
```

## Report Sections

| # | Section | Contents |
|---|---------|----------|
| 1 | Cover Page | Company name, date, confidentiality notice |
| 2 | Executive Summary | High-level financial health overview |
| 3 | Company Background | Industry, products, management, milestones |
| 4 | Competitor Analysis | Top competitors, market positioning, comparison table |
| 5 | Financial Summary | Key figures table (Revenue, EBITDA, Net Income, etc.) |
| 6 | Financial Ratios | 20+ ratios with benchmarks and PASS/CAUTION/FAIL status |
| 7 | Risk Factors | Categorized risks with severity and mitigation |
| 8 | Investment Pros | Strengths and growth drivers |
| 9 | Recommendation | BUY/HOLD/SELL verdict with detailed rationale |
| 10 | Disclaimer | Standard financial advice disclaimer |

## Financial Ratios Calculated

- **Liquidity**: Current Ratio, Quick Ratio, Cash Ratio
- **Profitability**: Gross Margin, Net Margin, EBITDA Margin, ROE, ROA
- **R' Ratios**: ROCE, ROIC, ROI, Return on Net Worth
- **Solvency**: Debt-to-Equity, Interest Coverage, Debt-to-Assets
- **Efficiency**: Asset Turnover, Inventory Turnover, Receivables Turnover
- **Valuation**: EPS, Book Value per Share, P/E Ratio
