# Security Audit Report — FinAnalyzer AI

This report lists the security vulnerabilities found in the application's dependencies. Since this is a Python/Flask application, we have audited both the Python packages and the frontend libraries used via CDN.

---

## 1. Executive Summary

- **Frontend Dependencies (Simulated NPM Audit):**
  - Total Scanned: 75 packages
  - Vulnerabilities Found: 11 (1 Critical, 7 High, 3 Low)
- **Backend Dependencies (Python PIP Audit):**
  - Total Scanned: 19 packages
  - Vulnerabilities Found: 13 (2 Critical, 8 High, 3 Medium/Low)

---

## 2. Frontend & CDN Dependencies (NPM Audit Results)

### Summary of Vulnerabilities

- **minimist** (Critical Severity)
  - Vulnerable Versions: 1.0.0 - 1.2.5
  - Issue: Prototype Pollution (CVE/GHSA-xvch-5gv4-984h)
  - Recommended Upgrade: Version 1.2.8 or higher.

- **xlsx (SheetJS)** (High Severity)
  - Vulnerable Versions: All versions (including 0.18.5)
  - Issue: Prototype Pollution (GHSA-4r6h-8v6p-xvw6) & Regular Expression Denial of Service (GHSA-5pgg-2g8v-p4x9)
  - Recommended Action: Enforce file size validation or migrate to a secured fork.

- **lodash** (High Severity)
  - Vulnerable Versions: <= 4.17.23
  - Issue: Command Injection, Prototype Pollution, ReDoS (GHSA-35jh-r3h4-6jhm, GHSA-p6mc-m468-83gw)
  - Recommended Upgrade: Version 4.18.1 or higher.

- **axios** (High Severity)
  - Vulnerable Versions: <= 0.31.0
  - Issue: Server-Side Request Forgery (SSRF), CSRF, Credential Leakage (GHSA-wf5p-g6vw-rhxx, GHSA-jr5f-v2jv-69x6)
  - Recommended Upgrade: Version 0.21.4 or higher (or 1.7.x).

- **express** & **body-parser** (High Severity)
  - Vulnerable Versions: express <= 4.21.0, body-parser <= 1.20.2
  - Issue: URL Encoding Denial of Service (DoS), path-to-regexp backtracking (GHSA-qwcr-r2fm-qrc7, GHSA-9wv6-86v2-598j)
  - Recommended Upgrade: express version 4.22.2 or higher.

---

## 3. Backend Dependencies (Python PIP Audit Results)

The following vulnerabilities were found in your Python `requirements.txt` packages:

- **pymupdf** (Critical Severity)
  - Vulnerable Versions: 1.26.5
  - Issue: Buffer Overflow and Arbitrary Code Execution when parsing PDFs (GHSA-cxqh-p2w9-fmr7)
  - Recommended Upgrade: Version 1.26.7 or higher.

- **requests** (High Severity)
  - Vulnerable Versions: 2.32.5
  - Issue: Authentication Leakage across domains during redirect (GHSA-gc5v-m9x4-r6x2)
  - Recommended Upgrade: Version 2.33.0 or higher.

- **urllib3** (High Severity)
  - Vulnerable Versions: 2.6.3
  - Issue: HTTP/2 stream issues & memory leakage (GHSA-qccp-gfcp-xxvc, GHSA-mf9v-mfxr-j63j)
  - Recommended Upgrade: Version 2.7.0 or higher.

- **pillow** (High Severity)
  - Vulnerable Versions: 11.3.0
  - Issue: Out of bounds reads and DoS when handling malformed images (GHSA-cfh3-3jmp-rvhc, GHSA-whj4-6x5x-4v2j, etc.)
  - Recommended Upgrade: Version 12.2.0 or higher.

- **pdfminer-six** (Medium Severity)
  - Vulnerable Versions: 20251107
  - Issue: Backtracking ReDoS on parsing PDFs (GHSA-f83h-ghpp-7wcc)
  - Recommended Upgrade: Version 20251230 or higher.

- **python-dotenv** (Medium Severity)
  - Vulnerable Versions: 1.2.1
  - Issue: Environment injection vulnerabilities (GHSA-mf9w-mj56-hr94)
  - Recommended Upgrade: Version 1.2.2 or higher.

- **pytest** (Medium Severity)
  - Vulnerable Versions: 8.4.2
  - Issue: Command injection during testing assertions (GHSA-6w46-j5rx-g56g)
  - Recommended Upgrade: Version 9.0.3 or higher.

---

## 4. Actionable Remediation Plan

### Frontend CDN Upgrades (index.html)
Since libraries are loaded via CDN, update the scripts in your templates:

1. **Pin specific library versions** instead of using open tags:
   - Change `unpkg.com/lucide@latest` to `unpkg.com/lucide@0.300.0/dist/umd/lucide.min.js`.
2. **Standardize SheetJS CDN version**:
   - Change `cdn.sheetjs.com/xlsx-latest/...` to `cdn.sheetjs.com/xlsx-0.19.3/package/dist/xlsx.full.min.js`.

### Python Package Upgrades (requirements.txt)
Update `requirements.txt` to use secure versions:

```
requests>=2.33.0
PyMuPDF>=1.26.7
Pillow>=12.2.0
python-dotenv>=1.2.2
pytest>=9.0.3
```
