# Deployment, 5 October 2026, evening

Published website commit: `f52fef1`, which merges the verified shop with the October marketplace preparation.
Primary URL: https://fabricationintelligence.com/.
Hosting: GitHub Pages, `MOSOKODOMO/form`, GitHub Actions deployment of `dist/` from `main` (run 37284587354, successful).

The homepage serves "Design products from makers we've verified". Shop, product pages, How it works, Verified makers and Partner return HTTP 200. The shop lists three products labelled SAMPLE, which are not for sale. No real product is live, and no checkout link is set. The release passed 102 Node tests and 22 Python tests. The Supabase migration is still not applied, and GA4 and Axiom are still not configured.

## Earlier deployment, 5 October 2026, afternoon

Published website commit: `c0852f6` (product-free FI Verify marketplace preparation).
Primary URL: https://fabricationintelligence.com/.
Hosting: GitHub Pages, `MOSOKODOMO/form`, GitHub Actions deployment of `dist/` from `main`.

The publishing workflow completed successfully. The homepage serves the new “Know who made it. See the proof.” copy; Shop, product detail, Verified Makers, and Partner pages return HTTP 200. The public products, makers, and reports JSON files all remain empty arrays. The release passed 75 automated tests before publication.

This publishes the static storefront only. The October Supabase migration has not been applied; GA4 and Axiom remain unconfigured; checkout is off. The alternate Vercel alias still served the earlier homepage when checked, so use the custom domain for this release.

## Earlier deployment, 17 September 2026

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
