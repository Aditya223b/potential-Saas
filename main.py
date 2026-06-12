#!/usr/bin/env python3
"""
Financial Statement Analysis Automation
========================================
CLI entry point that orchestrates the full analysis pipeline:
  PDF Parsing → Web Scraping → AI Analysis → Ratio Calculation → Report Generation → Email Delivery

Usage:
    python main.py --pdf "balance_sheet.pdf" "pl_statement.pdf" --email "recipient@example.com"
    python main.py --pdf "../DSRI FY24-25 Balance Sheet.pdf" "../DSRI FY24-25 P&L Statement.pdf" --email "your@email.com"
"""

import argparse
import os
import sys
import time
from datetime import datetime


def main():
    parser = argparse.ArgumentParser(
        description="🤖 Financial Statement Analysis Automation",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python main.py --pdf "statement.pdf" --email "you@example.com"
  python main.py --pdf "balance_sheet.pdf" "pl.pdf" --email "team@company.com"
  python main.py --pdf "statement.pdf" --no-email  (generate report only, no email)
        """,
    )
    parser.add_argument(
        "--pdf", nargs="+", required=True,
        help="Path(s) to financial statement PDF file(s)",
    )
    parser.add_argument(
        "--email", type=str, default=None,
        help="Recipient email address for the report",
    )
    parser.add_argument(
        "--no-email", action="store_true",
        help="Generate the report without sending email",
    )
    parser.add_argument(
        "--output-dir", type=str, default=".",
        help="Directory to save the generated report (default: current directory)",
    )

    args = parser.parse_args()

    # Validate PDF files exist
    for pdf_path in args.pdf:
        if not os.path.exists(pdf_path):
            print(f"❌ File not found: {pdf_path}")
            sys.exit(1)
        if not pdf_path.lower().endswith(".pdf"):
            print(f"❌ Not a PDF file: {pdf_path}")
            sys.exit(1)

    # Check email requirement
    if not args.no_email and not args.email:
        print("❌ Please provide --email or use --no-email flag")
        sys.exit(1)

    # Ensure output directory exists
    os.makedirs(args.output_dir, exist_ok=True)

    start_time = time.time()

    print()
    print("╔══════════════════════════════════════════════════════════════╗")
    print("║          🤖 FINANCIAL STATEMENT ANALYSIS AUTOMATION         ║")
    print("╚══════════════════════════════════════════════════════════════╝")
    print()
    print(f"📅 Date: {datetime.now().strftime('%B %d, %Y at %I:%M %p')}")
    print(f"📄 PDFs: {len(args.pdf)} file(s)")
    for p in args.pdf:
        print(f"   • {os.path.basename(p)}")
    if args.email:
        print(f"📧 Email: {args.email}")
    print()

    # ── Step 1: Parse PDFs ───────────────────────────────────────────────────
    print("=" * 60)
    print("📄 STEP 1: Parsing Financial Statements")
    print("=" * 60)

    from pdf_parser import parse_multiple_pdfs
    parsed = parse_multiple_pdfs(args.pdf)

    company_name = parsed["company_name"]
    print(f"\n  ✅ Company detected: {company_name}")
    print(f"  ✅ Gemini files uploaded: {len(parsed.get('gemini_files', []))}")
    print(f"  ✅ Total text length: {len(parsed.get('full_text', '')):,} characters")

    # ── Step 2: Web Research ─────────────────────────────────────────────────
    print()
    print("=" * 60)
    print("🌐 STEP 2: Web Research (Company & Competitors)")
    print("=" * 60)

    from web_scraper import scrape_company_info, search_competitors

    company_web = scrape_company_info(company_name)
    competitor_web = search_competitors(company_name)

    print(f"\n  ✅ Website found: {company_web.get('website_url', 'Not found')}")
    print(f"  ✅ Competitors scraped: {len(competitor_web)}")

    # ── Step 3: AI Analysis ──────────────────────────────────────────────────
    print()
    print("=" * 60)
    print("🤖 STEP 3: AI-Powered Financial Analysis")
    print("=" * 60)

    from analyzer import run_full_analysis

    analysis = run_full_analysis(
        company_name=company_name,
        gemini_files=parsed["gemini_files"],
        web_data=company_web.get("raw_data", ""),
        competitor_web_data=competitor_web,
    )

    print(f"\n  ✅ Analysis complete!")

    # ── Step 4: Generate Report ──────────────────────────────────────────────
    print()
    print("=" * 60)
    print("📝 STEP 4: Generating DOCX Report")
    print("=" * 60)

    from report_generator import generate_report

    report_path = generate_report(analysis, output_dir=args.output_dir)
    print(f"  ✅ Report ready: {report_path}")

    # ── Step 5: Send Email ───────────────────────────────────────────────────
    if not args.no_email and args.email:
        print()
        print("=" * 60)
        print("📧 STEP 5: Sending Email")
        print("=" * 60)

        from email_sender import send_report_email

        rec = analysis.get("recommendation", {})
        summary = analysis.get("financial_analysis", {}).get("executive_summary", "")

        ok, err = send_report_email(
            to_email=args.email,
            company_name=company_name,
            report_path=report_path,
            analysis_summary=summary,
            recommendation=rec.get("recommendation", ""),
        )

        if not ok:
            print(f"\n  ⚠️  Email sending failed: {err}. The report is still saved locally.")
    else:
        print("\n  ℹ️  Email skipped (--no-email flag)")

    # ── Done ─────────────────────────────────────────────────────────────────
    elapsed = time.time() - start_time
    print()
    print("╔══════════════════════════════════════════════════════════════╗")
    print("║                     ✅ ALL DONE!                            ║")
    print("╚══════════════════════════════════════════════════════════════╝")
    print(f"  ⏱️  Total time: {elapsed:.1f} seconds")
    print(f"  📄 Report: {report_path}")
    if not args.no_email and args.email:
        print(f"  📧 Sent to: {args.email}")
    print()


if __name__ == "__main__":
    main()
