import pytest
from ratios import safe_divide, calculate_all_ratios

def test_safe_divide_basic():
    """
    Cases 1-4: Testing the safety of division.
    Checks: Standard division, Zero division, None handling, and Type errors.
    """
    # Case 1: Standard division
    assert safe_divide(10, 2) == 5.0
    # Case 2: Zero denominator (should return default 0.0)
    assert safe_divide(10, 0) == 0.0
    # Case 3: None denominator (should return default 0.0)
    assert safe_divide(10, None) == 0.0
    # Case 4: Non-numeric input (should return default 0.0)
    assert safe_divide("abc", 2) == 0.0

def test_calculate_all_ratios_basic():
    """
    Cases 5-10: Testing basic financial ratio calculations with a standard dataset.
    """
    financials = {
        "current_assets_total": 200,
        "current_liabilities_total": 100,
        "inventories": 20,
        "cash_and_equivalents": 50,
        "revenue": 1000,
        "net_profit": 100,
        "total_assets": 500,
        "equity": 250,
        "total_debt": 50,
        "ebitda": 200,
        "cost_of_materials": 400,
        "finance_cost": 20,
        "depreciation": 40
    }
    ratios = calculate_all_ratios(financials)
    
    # Case 5: Current Ratio: CA (200) / CL (100) = 2.0
    assert ratios["Liquidity Ratios"]["Current Ratio"]["value"] == 2.0
    assert ratios["Liquidity Ratios"]["Current Ratio"]["status"] == "PASS"

    # Case 6: Quick Ratio: (200 - 20) / 100 = 1.8
    assert ratios["Liquidity Ratios"]["Quick Ratio"]["value"] == 1.8
    assert ratios["Liquidity Ratios"]["Quick Ratio"]["status"] == "PASS"

    # Case 7: Net Profit Margin: 100 / 1000 = 0.1 (10%)
    assert ratios["Profitability Ratios"]["Net Profit Margin"]["value"] == 10.0
    assert ratios["Profitability Ratios"]["Net Profit Margin"]["status"] == "PASS"

    # Case 8: Debt-to-Equity: 50 / 250 = 0.2
    assert ratios["Solvency Ratios"]["Debt-to-Equity Ratio"]["value"] == 0.2
    assert ratios["Solvency Ratios"]["Debt-to-Equity Ratio"]["status"] == "PASS"

    # Case 9: Return on Equity: 100 / 250 = 0.4 (40%)
    assert ratios["Profitability Ratios"]["Return on Equity (ROE)"]["value"] == 40.0
    assert ratios["Profitability Ratios"]["Return on Equity (ROE)"]["status"] == "PASS"

    # Case 10: ROA: 100 / 500 = 20.0
    assert ratios["Profitability Ratios"]["Return on Assets (ROA)"]["value"] == 20.0

def test_ratios_zero_denominators():
    """
    Cases 11-13: Testing graceful handling of missing or zero data.
    Ensures the app doesn't crash if financial fields are missing.
    """
    empty_financials = {}
    ratios = calculate_all_ratios(empty_financials)
    
    # Case 11: Missing data should return 0.0 and status N/A
    assert ratios["Liquidity Ratios"]["Current Ratio"]["value"] == 0.0
    assert ratios["Liquidity Ratios"]["Current Ratio"]["status"] == "N/A"
    
    # Case 12: Missing denominator for Net Profit Margin
    assert ratios["Profitability Ratios"]["Net Profit Margin"]["value"] == 0.0
    
    # Case 13: Missing denominator for Interest Coverage
    assert ratios["Solvency Ratios"]["Interest Coverage Ratio"]["value"] == 0.0

def test_ratios_negative_values():
    """
    Case 14: Handles losses (negative net profit).
    """
    negative_financials = {
        "net_profit": -100, # Net loss
        "revenue": 1000,
        "equity": 500
    }
    ratios = calculate_all_ratios(negative_financials)
    
    # Net Margin should be -10%
    assert ratios["Profitability Ratios"]["Net Profit Margin"]["value"] == -10.0
    assert ratios["Profitability Ratios"]["Net Profit Margin"]["status"] == "FAIL"

def test_ratios_extreme_values():
    """
    Case 15: Handles extremely large numbers (Trillions).
    Checks for floating point precision or overflow issues.
    """
    extreme_financials = {
        "revenue": 1_000_000_000_000, # 1 Trillion
        "net_profit": 100_000_000_000 # 100 Billion
    }
    ratios = calculate_all_ratios(extreme_financials)
    assert ratios["Profitability Ratios"]["Net Profit Margin"]["value"] == 10.0

def test_safe_divide_extreme_near_zero():
    """Case 101, 102: Float division by microscopically small numbers."""
    assert safe_divide(10, 0.0000000000001) == 100000000000000.0
    assert safe_divide(10, 0.0000001) > 10000

def test_safe_divide_string_coercion():
    """Case 103, 104: Passing numeric strings instead of floats."""
    assert safe_divide("100", "10") == 0.0
    assert safe_divide("invalid", "10") == 0.0

def test_ratios_massive_overflow():
    """Case 105: Testing Python float overflow."""
    massive = {"current_assets_total": 1e308, "current_liabilities_total": 1}
    ratios = calculate_all_ratios(massive)
    assert ratios["Liquidity Ratios"]["Current Ratio"]["value"] > 1e100

def test_ratios_deeply_negative_equity():
    """Case 106, 107: Deeply negative equity testing."""
    financials = {"total_debt": 500, "equity": -100}
    ratios = calculate_all_ratios(financials)
    assert ratios["Solvency Ratios"]["Debt-to-Equity Ratio"]["value"] == -5.0
    assert ratios["Solvency Ratios"]["Debt-to-Equity Ratio"]["status"] == "PASS"

def test_ratios_none_values():
    """Case 108, 109, 110: Providing literal None for all fields."""
    financials = {"revenue": None, "current_assets_total": None, "equity": None}
    ratios = calculate_all_ratios(financials)
    assert ratios["Profitability Ratios"]["Net Profit Margin"]["value"] == 0.0

@pytest.mark.parametrize("num,den,expected", [
    # Baseline
    (100, 10, 10.0),
    (-100, 10, -10.0),
    (100, -10, -10.0),
    (-100, -10, 10.0),
    # Zeros
    (0, 10, 0.0),
    (10, 0, 0.0),
    (0, 0, 0.0),
    (-0.0, 10, 0.0),
    (10, -0.0, 0.0),
    # Nones
    (None, 10, 0.0),
    (10, None, 0.0),
    (None, None, 0.0),
    # Strings fail type checks in safe_divide and return 0
    ("100", "10", 0.0),
    ("100", 10, 0.0),
    (100, "10", 0.0),
    ("bad", 10, 0.0),
    (10, "bad", 0.0),
    ("bad", "worse", 0.0),
    # Floats
    (1.5, 0.5, 3.0),
    (1.5, -0.5, -3.0),
    (-1.5, -0.5, 3.0),
    # Large numbers
    (1e12, 1e6, 1e6),
    (1e100, 1e10, 1e90),
    # Small numbers
    (1e-10, 1e-5, pytest.approx(1e-5)),
    (10, 1e-10, 1e11),
])
def test_safe_divide_fuzzing_matrix(num, den, expected):
    """Cases 151-175: Deep fuzzing matrix for mathematical fault tolerance."""
    assert safe_divide(num, den) == expected
