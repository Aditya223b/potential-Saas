import sys
sys.path.insert(0, '/Users/ranjan/Desktop/some/financial_analyzer')
from app import AnalysisJob, run_extraction_pipeline

job = AnalysisJob("test_job", None, [])
pdf_paths = [
    '/Users/ranjan/Desktop/some/docss/AUDITED FINANCIALS - FY 2022.pdf'
]

print("Running extraction pipeline...")
run_extraction_pipeline(job, pdf_paths)
print("Job status:", job.status)
if job.error:
    print("Error:", job.error)
print("Extracted Financials:", job.extracted_financials)
if hasattr(job, "background"):
    print("Background:", job.background)
