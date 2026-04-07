---
title: Financial Analyzer
emoji: 📊
colorFrom: indigo
colorTo: purple
sdk: docker
pinned: false
license: mit
short_description: AI-powered financial statement analysis & investment reports
---

# 📊 Financial Statement Analyzer

AI-powered automation that analyses audited financial statements (Balance Sheet, P&L, Cash Flow) and generates comprehensive investment analysis reports.

## What It Does

1. **Uploads** your PDFs directly to Gemini's native File API for accurate extraction
2. **Scrapes** the company's website and competitor websites for background research
3. **Extracts** multi-year financial figures with AI
4. **Validates** extracted data via a human-in-the-loop review step
5. **Calculates** 20+ financial ratios (Liquidity, Profitability, R' Ratios, Solvency, Efficiency)
6. **Generates** a professional DOCX investment proposal report

## Setup (Environment Variables)

Set these secrets in your Hugging Face Space settings:

| Variable | Where to get it |
|----------|----------------|
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) |
| `SUPABASE_URL` | Supabase project → Settings → API |
| `SUPABASE_KEY` | Supabase project → Settings → API (anon key) |
| `SUPABASE_SERVICE_KEY` | Supabase project → Settings → API (service_role key) |
| `SMTP_EMAIL` | Your Gmail address |
| `SMTP_APP_PASSWORD` | [Google App Passwords](https://myaccount.google.com/apppasswords) |

## Financial Ratios

- **Liquidity**: Current Ratio, Quick Ratio, Cash Ratio
- **Profitability**: Gross Margin, Net Margin, EBITDA Margin, ROE, ROA
- **R' Ratios**: ROCE, ROIC, ROI, Return on Net Worth
- **Solvency**: Debt-to-Equity, Interest Coverage, Debt-to-Assets
- **Efficiency**: Asset Turnover, Inventory Turnover, Receivables Turnover
