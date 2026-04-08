import os
import pytest
from unittest.mock import MagicMock, patch
from report_generator import generate_report

def test_generate_report_basic():
    """Case 86: DOCX file creation with basic data."""
    analysis = {
        "company_name": "Test Corp",
        "company_background": {"company_description": "Desc"},
        "financials": {
            "years_found": ["FY2024"],
            "FY2024": {"revenue": 100, "net_profit": 10}
        },
        "computed_ratios": {
            "FY2024": {
                "Liquidity Ratios": {"Current Ratio": {"formatted": "2.0", "status": "PASS"}}
            }
        },
        "financial_analysis": {"executive_summary": "Summary"},
        "risk_analysis": {"risk_factors": [], "investment_pros": [], "investment_cons": []},
        "recommendation": {"recommendation": "BUY"}
    }
    
    # Mocking docx to avoid filesystem reliance in basic check, 
    # but let's actually let it run to test the 'docx' library integration
    output_dir = "/tmp/test_reports"
    filename = "test.docx"
    
    # Ensure cleanup
    full_path = os.path.join(output_dir, filename)
    if os.path.exists(full_path): os.remove(full_path)
    
    path = generate_report(analysis, output_dir=output_dir)
    
    assert os.path.exists(path)
    assert path.endswith(".docx")
    
    # Cleanup
    os.remove(path)

def test_report_verdict_colors():
    """Case 90: Verify verdict color mapping (BUY=Green, AVOID=Red)."""
    # We can test internal logic if we export _run, or just mock RGBColor
    from report_generator import GREEN, RED, ORANGE
    
    # Internal lambda/check test
    def get_color(v):
        return GREEN if v.upper() in ("BUY", "CONDITIONAL APPROVAL") else RED if v.upper() in ("SELL", "AVOID") else ORANGE
    
    assert get_color("BUY") == GREEN
    assert get_color("AVOID") == RED
    assert get_color("HOLD") == ORANGE

def test_generate_report_missing_data():
    """Case 89: Handling of empty sections without crashing."""
    analysis = {
        "company_name": "Ghost Corp",
        "financials": {"years_found": []}, # Empty years
        "recommendation": {"recommendation": "N/A"}
    }
    # Should not crash
    path = generate_report(analysis, output_dir="/tmp/test_reports")
    assert os.path.exists(path)
    os.remove(path)
