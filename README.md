# Fabrication Intelligence

The October 2026 marketplace update is prepared in code, with **no real products or makers published**. The homepage introduces the evidence-led shop; [Shop](dist/shop.html), [Product detail](dist/product.html), and [Verified makers](dist/verified-makers.html) have honest empty states until a report and listing pass the publication gates. The earlier windows/sourcing pilot remains accessible, labelled as earlier work; it is not the new shop.

## Preview and tests

Run `node preview.mjs`, then open http://127.0.0.1:4173/. No build or package installation is required for the static pages. Run `node --test tests/*.test.cjs fi-verify/*.test.cjs scripts/catalogue-integration.test.cjs` for the site, verification, and importer tests. The existing Supabase database tests require a separate local database setup.

## What is prepared

- `fi-verify/` drafts public-source maker reports, checks issuer registers and test-lab accreditation, calculates a provisional FI Score, and requires a human reviewer to approve a report and choose an explicit verified/not-verified/inconclusive decision. Missing evidence is never treated as a failed check. A score appears only when at least 75% of the rubric and all core checks are assessed; buyer experience stays unscored until genuine verified-purchase reviews exist.
- `dist/data/products.json`, `makers.json`, and `reports.json` are empty. `dist/catalog.js` renders only records linked to a current, human-approved verified report and an approved photo. An expired certificate or test-lab accreditation suppresses the Verified listing.
- `scripts/import-product-sheet.cjs` accepts the FI Product Sheet CSV/JSON columns, plus an explicit `FI report ID` for each row. It ignores the Sheet's FI Score and skips drafts. See [catalogue-data.md](project-planning/catalogue-data.md) for the exact import and first-product steps.
- `supabase/migrations/20261005033831_fi_marketplace_catalogue.sql` prepares future maker, report, product, and feedback tables with row-level security. **This migration has not been applied**, and the current static shop does not query those tables.
- Google Analytics 4 is a disabled-by-default `dist/telemetry.js` integration until a measurement ID is supplied. [Axiom setup](observability/README.md) is a server-only, opt-in FI Verify event logger; it requires environment variables and does not send maker names or certificate details. Neither sends data in the default preview.
- A Stripe Payment Link field is prepared but checkout is off. A Buy link appears only after a product is publishable, its payment link is valid, and `checkoutReady` is explicitly set to `true`. Do not enable it before payment terms and signed-webhook fulfillment are ready.

The feedback form still sends its response to the team inbox via FormSubmit. It is **not** yet connected to the new Supabase feedback table or the Notion FI User Feedback database. The old client/manufacturer accounts and sourcing requests remain separate from any future shop order history.

## Publishing and environment

This preparation is local to the `codex/fi-verify-catalogue-prep` branch; it has not been deployed. The existing GitHub Actions workflow publishes `dist/` to https://fabricationintelligence.com/ on pushes to `main`, and Vercel serves the same static site at https://fabrication-intelligence.vercel.app/ using `vercel.json`.

The existing Supabase project `dszagdjnymxalpwamjyh` stores private request, account, and manufacturer data. Only the browser-safe publishable key belongs in the website. Never commit service keys, private customer records, or unpublished research notes. The October marketplace migration needs separate review and an explicit apply step before any database-backed catalogue goes live.

Historical sourcing implementation notes remain in [project-planning/README.md](project-planning/README.md), [WEEK-3-IMPLEMENTATION.md](project-planning/WEEK-3-IMPLEMENTATION.md), and [SPEC.md](SPEC.md).
