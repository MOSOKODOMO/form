# Marketplace catalogue data preparation

The public site currently has no product, maker, or report records. `dist/data/products.json`, `makers.json`, and `reports.json` are all empty arrays. Shop, product detail, and Verified Makers therefore show their authored empty states.

## Public files and publication rules

`dist/catalog.js` reads the three JSON arrays. A shop product appears only when:

- its status is `Approved` or `Live`;
- photo permission is explicitly `Approved`, and its photo URL is safe;
- it references a specific FI Verify report by `reportId`;
- that report is human approved, has public HTTP(S) source links, says `decision: "verified"`, and has `verificationCurrent: true`;
- the report's maker name, website host, and product type match the product's maker and category; and
- at least one human verified certificate or accredited test report remains unexpired.

The browser checks these conditions again. `makers.json` can list a maker with no products, but Verified Makers only renders that maker when one of its linked reports meets the same current verified report checks. An approved report marked `inconclusive` or `not_verified` is not a Verified Makers listing. A report approval means a person approved the report for publication; it does not mean the maker passed.

The score shown on site comes only from FI Verify. The Product Sheet's `FI Score` field is ignored. The site labels v0 scores provisional, shows evidence coverage and the complete breakdown and source list, and identifies buyer experience as unscored until verified purchase reviews exist. It recalculates certificate and accreditation expiry on each page load, so yesterday's export cannot keep an expired proof marked current in the UI.

## Later: add the first real record

1. Research the maker and product type with `fi-verify/`. A human checks public issuer registers or lab accreditation, records the findings, chooses the explicit decision, and approves the report. Export only `getPublicReport(approvedReport)` results into `dist/data/reports.json`. Do not put drafts or private research notes in this public file.
2. Export the FI Product Sheet as CSV or JSON. The importer accepts its existing headers: `Product`, `Added by`, `Category`, `Certificates listed`, `Country`, `FI Score`, `Finishes`, `MOQ`, `Maker`, `Maker URL`, `Maker reply`, `Material`, `Photo URL`, `Photo permission`, `Price USD`, `Product URL`, `Sizes`, `Status`, `Story CN`, and `Story EN`.
3. Add one optional `FI report ID` column to the export, containing the approved report's UUID for each product. Use the Product Sheet category as the report's `maker.productType`. The importer requires this explicit link; it does not guess which report belongs to a product.
4. Check photo rights, then set the Product Sheet status to `Approved` or `Live` and photo permission to `Yes` or `Approved`. A draft row will be skipped. Run `node scripts/import-product-sheet.cjs path/to/export.csv --check` first, then rerun without `--check` to regenerate the public `products.json` and `makers.json`. It never writes `reports.json`.
5. Review the generated JSON and pages before publishing the site. The importer emits only public, eligible products and verified makers. It omits `Added by`, `Maker reply`, `Certificates listed`, and the Sheet's `FI Score`: those are not public proof or a verified score.

`scripts/product-sheet-template.csv` is a header-only template. Optional columns at the end support a confirmed delivery time and factual origin fields. The importer leaves `deliveryTimeConfirmed` false; set it true only after the delivery claim is confirmed. The origin card appears only when facts such as the town, craft, materials, or distance are supplied. It does not invent an origin story.

Product JSON also has `paymentLink` and `checkoutReady` slots. The importer always leaves both empty/false, even if a sheet contains a link. A public Buy link appears only when a person later sets `checkoutReady: true` on a publishable product and supplies a valid `https://checkout.stripe.com/...` or `https://buy.stripe.com/...` link. Set this only after Stripe business terms and order fulfillment via a signature-verified webhook are configured. Fulfillment must respond to paid `checkout.session.completed` and `checkout.session.async_payment_succeeded` events, not a browser success page.

## Prepared Supabase schema

`supabase/migrations/20261005033831_fi_marketplace_catalogue.sql` is an unapplied preparation for a future managed data flow. It defines makers, approved public reports, products, and private feedback. Row level security lets the public read only current verified makers and products with photo permission. Its read policy checks proof expiry against the current date as well as the saved `verificationCurrent` flag. Only an authenticated FI team member can insert an approved report, with their own Auth user ID as approver. The feedback table matches the current form fields (`role`, `would_use`, `proof`, `concern`, `source_next`, `name`, `email`); it is private and team-write-only until a validated, rate-limited public submission endpoint is ready. The current site does not query these tables.

The migration depends on the existing `fi_team_members` table from `supabase/fi-stage2.sql`. No live database was changed. An isolated PGlite smoke run applied the SQL and confirmed public reads hide draft products, private feedback, a report with `verificationCurrent: false`, and a report whose only lab accreditation had expired. Before applying it to Supabase, run its database advisors and review the live project configuration, then connect the static export or API deliberately.
