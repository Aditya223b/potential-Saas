import sys
import os

sys.path.insert(0, '/Users/ranjan/Desktop/some/financial_analyzer')
from app import AnalysisJob, run_extraction_pipeline

pdf_paths = [
    '/Users/ranjan/Desktop/some/docss/AUDITED FINANCIALS - FY 2023.pdf',
    '/Users/ranjan/Desktop/some/docss/AUDITED FINANCIALS - FY 2024.pdf',
]

filenames = [os.path.basename(p) for p in pdf_paths]
pdf_bytes_list = []
for p in pdf_paths:
    with open(p, "rb") as f:
        pdf_bytes_list.append(f.read())

job = AnalysisJob("test_job", filenames)

print("Running extraction pipeline...")
run_extraction_pipeline(job, pdf_bytes_list, filenames)
print("Job status:", job.status)
if job.error:
    print("Error:", job.error)
print("Extracted Financials:", job.extracted_financials)
if hasattr(job, "background"):
    print("Background:", job.background)
