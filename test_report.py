import sys
import json
import traceback

from report_generator import generate_report

print("--- Starting DOCX Generation Test ---")

# Mock data
analysis = {
    "company_name": "Test Company",
    "financials": {},
    "computed_ratios": {},
    "growth_metrics": {},
    "company_background": {"industry": "Test"},
    "competitor_analysis": {"competitors": []},
    "financial_analysis": {},
    "risk_analysis": {},
    "recommendation": {"recommendation": "BUY"}
}

try:
    report_path = generate_report("Test Company", analysis, "test-job-123")
    print(f"SUCCESS: {report_path}")
except Exception as e:
    print(f"FAILED with exception:")
    traceback.print_exc()
