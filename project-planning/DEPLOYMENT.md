# Deployment — 17 September 2026

Published commit: 1f39ea3 (bilingual RFQ prototype and staircase catalogue).
Hosting: GitHub Pages, MOSOKODOMO/form, GitHub Actions deployment from dist.
Custom domain: fabricationintelligence.com.

Cloudflare DNS (DNS only):
- A @: 185.199.108.153
- A @: 185.199.109.153
- A @: 185.199.110.153
- A @: 185.199.111.153
- CNAME www: mosokodomo.github.io

Deployment confirmed successful. Main domain HTTP response is 200 and deployed rfq.js matches local SHA-256. The apex domain has a valid HTTPS certificate, returns HTTP 200 over HTTPS, and HTTP redirects to HTTPS. Enforce HTTPS is enabled. Local network DNS still caches the former no-address response. The www DNS record is correct on public resolver 1.1.1.1, but GitHub still reports a cached DNS failure and its www certificate is pending. Use the apex HTTPS URL.

Requests remain browser-local drafts, not delivered enquiries. Existing localhost drafts are not migrated to the custom domain. No database, email sending, accounts or file uploads are enabled. Screenshot archives remain local and were not pushed.
