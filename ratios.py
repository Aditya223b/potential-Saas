"""
Financial Ratio Calculator — Computes key financial ratios from extracted data.
Covers: Liquidity, Profitability, R' Ratios (Returns), Solvency, Efficiency, Valuation.
"""


def safe_divide(numerator: float, denominator: float, default: float = 0.0) -> float:
    """Safe division that returns default on zero/None denominator."""
    try:
        if denominator is None or denominator == 0:
            return default
        return numerator / denominator
    except (TypeError, ValueError):
        return default


def calculate_all_ratios(financials: dict) -> dict:
    """
    Calculate all financial ratios from a financials dictionary.
    """
    def g(key: str) -> float:
        val = financials.get(key, 0)
        try:
            return float(val) if val is not None else 0.0
        except (ValueError, TypeError):
            return 0.0

    ratios = {}

    # ── 1. LIQUIDITY RATIOS ─────────────────────────────────────────────────
    ratios["Liquidity Ratios"] = {
        "Current Ratio": _ratio(
            safe_divide(g("current_assets_total"), g("current_liabilities_total")),
            benchmark="1.5 – 3.0",
            good_min=1.5, good_max=3.0
        ),
        "Quick Ratio": _ratio(
            safe_divide(g("current_assets_total") - g("inventories"), g("current_liabilities_total")),
            benchmark="1.0 – 2.0",
            good_min=1.0, good_max=2.0
        ),
        "Cash Ratio": _ratio(
            safe_divide(g("cash_and_equivalents"), g("current_liabilities_total")),
            benchmark="> 0.5",
            good_min=0.5
        ),
    }

    # ── 2. PROFITABILITY RATIOS ─────────────────────────────────────────────
    # Gross Profit = Revenue - Cost of Materials
    gross_profit = g("revenue") - g("cost_of_materials")
    ratios["Profitability Ratios"] = {
        "Gross Profit Margin": _ratio(
            safe_divide(gross_profit, g("revenue")) * 100,
            suffix="%", benchmark="> 30%",
            good_min=30
        ),
        "Net Profit Margin": _ratio(
            safe_divide(g("net_profit"), g("revenue")) * 100,
            suffix="%", benchmark="> 10%",
            good_min=10
        ),
        "EBITDA Margin": _ratio(
            safe_divide(g("ebitda"), g("revenue")) * 100,
            suffix="%", benchmark="> 15%",
            good_min=15
        ),
        "Return on Equity (ROE)": _ratio(
            safe_divide(g("net_profit"), g("equity")) * 100,
            suffix="%", benchmark="> 15%",
            good_min=15
        ),
        "Return on Assets (ROA)": _ratio(
            safe_divide(g("net_profit"), g("total_assets")) * 100,
            suffix="%", benchmark="> 5%",
            good_min=5
        ),
    }

    # ── 3. R' SCORE (Rehbar Proprietary Composite) ────────────────────────────
    # R' = 6×(WC Cushion / TA) + 3×(RE / TA) + 7×(EBITDA / TA) + 1×(Equity / Outside Liabilities)
    
    net_worth = g("equity")
    total_assets = g("total_assets")
    outside_liabilities = g("current_liabilities_total") + g("long_term_borrowings")
    if outside_liabilities == 0:
        outside_liabilities = total_assets - net_worth
        
    retained_earnings = g("reserves")
    wc_cushion = g("working_capital") or (g("current_assets_total") - g("current_liabilities_total"))
    ebitda = g("ebitda")

    r_wc_ta = safe_divide(wc_cushion, total_assets)
    r_re_ta = safe_divide(retained_earnings, total_assets)
    r_ebitda_ta = safe_divide(ebitda, total_assets)
    r_eq_ol = safe_divide(net_worth, outside_liabilities)

    r_score = (6 * r_wc_ta) + (3 * r_re_ta) + (7 * r_ebitda_ta) + (1 * r_eq_ol)

    ratios["R' Score"] = {
        "R' Score (Composite)": _ratio(
            r_score,
            benchmark="> 2.0 Safe | 1.0–2.0 Caution | < 1.0 Distress",
            good_min=2.0
        ),
        "WC Cushion / Total Assets (×6)": _ratio(
            r_wc_ta,
            benchmark="> 0.05",
            good_min=0.05
        ),
        "Retained Earnings / Total Assets (×3)": _ratio(
            r_re_ta,
            benchmark="> 0.10",
            good_min=0.10
        ),
        "EBITDA / Total Assets (×7)": _ratio(
            r_ebitda_ta,
            benchmark="> 0.10",
            good_min=0.10
        ),
        "Equity / Outside Liabilities (×1)": _ratio(
            r_eq_ol,
            benchmark="> 0.20",
            good_min=0.20
        ),
    }

    # ── ADDITIONAL RETURN RATIOS ────────────────────────────────────────────
    capital_employed = (total_assets - g("current_liabilities_total"))
    invested_capital = (g("equity") + g("long_term_borrowings"))
    operating_income = g("ebitda") - g("depreciation")

    ratios["Return Ratios"] = {
        "Return on Capital Employed (ROCE)": _ratio(
            safe_divide(operating_income, capital_employed) * 100 if capital_employed else 0,
            suffix="%", benchmark="> 15%",
            good_min=15
        ),
        "Return on Invested Capital (ROIC)": _ratio(
            safe_divide(g("net_profit"), invested_capital) * 100 if invested_capital else 0,
            suffix="%", benchmark="> 12%",
            good_min=12
        ),
        "Return on Net Worth (RONW)": _ratio(
            safe_divide(g("net_profit"), net_worth) * 100 if net_worth else 0,
            suffix="%", benchmark="> 12%",
            good_min=12
        ),
    }

    # ── 4. SOLVENCY RATIOS ──────────────────────────────────────────────────
    ratios["Solvency Ratios"] = {
        "Debt-to-Equity Ratio": _ratio(
            safe_divide(g("total_debt"), g("equity")) if g("equity") and g("equity") > 0 else float("inf"),
            benchmark="< 2.0 (positive equity)",
            good_max=2.0
        ),
        "Interest Coverage Ratio": _ratio(
            safe_divide(operating_income, g("finance_cost")),
            benchmark="> 3.0",
            good_min=3.0
        ),
        "Debt-to-Assets Ratio": _ratio(
            safe_divide(g("total_debt"), g("total_assets")),
            benchmark="< 0.6",
            good_max=0.6
        ),
    }

    # ── 5. EFFICIENCY RATIOS ────────────────────────────────────────────────
    ratios["Efficiency Ratios"] = {
        "Asset Turnover Ratio": _ratio(
            safe_divide(g("revenue"), g("total_assets")),
            benchmark="> 1.0",
            good_min=1.0
        ),
        "Inventory Turnover Ratio": _ratio(
            safe_divide(g("cost_of_materials"), g("inventories")),
            benchmark="> 5.0",
            good_min=5.0
        ),
        "Receivables Turnover Ratio": _ratio(
            safe_divide(g("revenue"), g("trade_receivables")),
            benchmark="> 6.0",
            good_min=6.0
        ),
    }

    return ratios


def _ratio(
    value: float,
    suffix: str = "",
    benchmark: str = "—",
    good_min: float | None = None,
    good_max: float | None = None,
) -> dict:
    """
    Format a single ratio with its benchmark and PASS/CAUTION/FAIL status.
    """
    if value is None:
        status = "N/A"
    elif good_min is not None and good_max is not None:
        if good_min <= value <= good_max:
            status = "PASS"
        elif value < good_min * 0.7 or value > good_max * 1.3:
            status = "FAIL"
        else:
            status = "CAUTION"
    elif good_min is not None:
        if value >= good_min:
            status = "PASS"
        elif value >= good_min * 0.7:
            status = "CAUTION"
        else:
            status = "FAIL"
    elif good_max is not None:
        if value <= good_max:
            status = "PASS"
        elif value <= good_max * 1.3:
            status = "CAUTION"
        else:
            status = "FAIL"
    else:
        status = "N/A"

    if isinstance(value, float):
        formatted = f"{value:.2f}{suffix}"
    else:
        formatted = f"{value}{suffix}"

    return {
        "value": value,
        "formatted": formatted,
        "benchmark": benchmark,
        "status": status,
    }


def ratios_to_flat_list(ratios: dict) -> list[tuple[str, str, str]]:
    """Flatten ratios for display/reports."""
    flat = []
    for cat, items in ratios.items():
        for name, data in items.items():
            flat.append((name, data["formatted"], data["status"]))
    return flat
