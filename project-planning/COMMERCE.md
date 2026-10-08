# Warehouse commerce handoff

Updated 8 October 2026 (Australia/Sydney).

## Delivered

The user's model is retail procurement through FI: customer payment, supplier purchase, inbound delivery to FI's warehouse, inspection, then delivery to the customer. This supersedes the earlier immediate Connect supplier-split proposal for this workflow. No Connect transfer is made by this implementation.

- `commerce-admin.html`: FI-team-only source/product editor, importer draft upload, supporting references, warehouse address/contact editor, pricing policy, quotes, purchase references, inbound tracking, receipt, full inspection with private evidence uploads, outbound tracking and return/issue intake.
- `order-catalogue.html`: published commerce products grouped by category and authenticated delivery-address/quantity requests. The current static `shop.html`, rankings and existing extraction/image tools remain intact. A link from the shop opens the new order catalogue.
- `orders.html`: customer-owned orders, inclusive AUD total, payment state, refund totals and outbound tracking. Account links expose this flow; team accounts also get the warehouse/admin link.
- **Import from link** in Products & sources now calls the private `fi-product-import` Edge Function. It reads the listing into a staged review: title, a description assembled from stated facts, supplier, specifications, variants, MOQ, price references, supplier photos and source/profile references. **Use draft in editor** fills the form; **Save product** persists through the existing commerce endpoint. Re-importing a saved source targets the existing entry and resets review/publication/photo permission. Nothing is automatically published or purchased.
- The local Python importer's JSON upload remains available. The web importer adapts its evidence-first approach to Alibaba's structured page data; it does not execute Python on the website. A blocked listing has a **Paste page text** fallback. Unknown facts remain blank, source statements are not independent verification, and photo import does not establish permission. This release imports supplier photos; it does not generate AI imagery or call a paid AI provider.
- The supplied Alibaba URL, including the original URL and a tracking-free canonical URL, is stored as an unverified private draft. No price, stock, material certification or product photo was invented.

## Applied Supabase changes

Project: `dszagdjnymxalpwamjyh` (the existing FI project).

Applied the two `fi_commerce` and `fi_commerce_review_fixes` migrations in this folder's parent `supabase/migrations/`. Deployed `fi-commerce` and `fi-stripe-webhook` Edge Functions. The latter uses Stripe signature authentication and intentionally has JWT verification disabled; the former requires a user JWT and validates the user with Auth again.

| Area | Tables |
| --- | --- |
| Catalogue and research | `fi_shop_categories`, `fi_shop_products`, `fi_product_sources`, `fi_product_evidence` |
| Configuration | `fi_warehouses`, `fi_commerce_settings` |
| Customer commitments | `fi_shop_orders`, `fi_shop_order_items`, `fi_order_costs` |
| Payments | `fi_checkout_attempts`, `fi_shop_payments`, `fi_payment_events` |
| Procurement and fulfilment | `fi_purchase_orders`, `fi_inspections`, `fi_order_shipments`, `fi_order_returns` |
| Audit | `fi_commerce_audit` |

Orders include `user_id`, immutable product/variant snapshots, contact email/phone, delivery/billing address snapshots, acceptance version/time, quote validity, approved amount, payment state and fulfilment holds. Internal costs preserve source currency, source price, exchange rate and supplier snapshots. Purchase instructions preserve their receiving warehouse snapshot. Payment records store provider IDs and statuses; never PAN, CVC or bank credentials.

All 17 tables have RLS and explicit grants. Browsers cannot write prices, approval, payments, purchasing or fulfilment states. Customers read only their own orders/payment records and outbound shipments; source costs, warehouse contacts, internal evidence, audit and supplier orders are team-only. Mutation RPCs are SECURITY INVOKER and service-role-only. `fi-commerce-evidence` is a private 10 MB/file bucket.

The previously prepared `fi_marketplace_*` migration remains unapplied and independent. Do not run a blind `supabase db push`: this repository has historical migrations that were prepared separately from the hosted schema. Inspect migration history first.

## Pricing policy configured

Confirmed: AUD and one inclusive displayed total. Markup is 10% of the source cost converted to AUD. All money is stored in integer cents; source unit conversion is rounded before multiplication by quantity, and markup is rounded on the source subtotal.

The owner selected **Include all costs in the displayed price**. On 8 October, `fi_commerce_settings.pricing_mode` was set to `costs_included` in the hosted project with an audit entry: source + 10% markup + inbound freight + inspection + outbound freight + duties + applicable tax + payment-cost allowance. $10 AUD source and $4 other costs gives $15 AUD total. The customer sees one total, not an extra shipping charge at payment. The admin pricing selector displays the saved policy.

The receiving address was also saved privately in `fi_warehouses` as an **inactive draft**. Its contact name and phone are still missing, so it cannot be used for supplier purchasing. Keep the street address out of public source files and policy pages. The owner can finish it in **Warehouse & commerce → Warehouse**, then activate it.

These are not automatic freight, tax or currency quotations. FI enters and approves current amounts, including explicit zero amounts, tax treatment and delivery scope. Destination-specific cost uncertainty is why the first version requests an inclusive quote before payment. A source price alone is not advertised as a final delivered price. No automatic tax registration or universal GST rate is assumed.

## Supplier-link importer

The deployed `fi-product-import` function requires JWT verification plus a confirmed, non-anonymous Auth user and a role in `fi_team_members`. It makes no product writes: only a private audit entry per import attempt. The existing audit records provide an eight-attempts-per-minute per-user throttle (best effort for concurrent requests). No new tables, Auth settings or payment function changes were needed.

Network fetches are restricted to HTTPS Alibaba product-detail links. Tracking parameters are removed for fetching while the supplied source link is retained in the draft. Robots rules are checked, each redirect must stay on an allowed Alibaba product URL for the same product ID, and timeout/body-size limits apply. Supplier JavaScript is parsed only when it contains JSON; it is never evaluated. Only Alibaba CDN photo URLs are offered. CAPTCHA, login, refusal, changed product IDs and empty responses surface a useful error and the manual paste alternative.

Price ranges and multiple-variant listings never become an exact source unit price automatically. Currency conversion, supplier quote validity, variant selection and photo permission require review. Imported source references are supplier statements, not a claim that an independent register or certificate was checked. The supplied Dooroom page was used to validate title, supplier, model, material, MOQ, variants, six photo links and its USD range; the raw page is kept out of Git.

Code is in `supabase/functions/_shared/product-import*.mjs`, `supabase/functions/fi-product-import/` and `dist/product-import.js`. The frontend uses text nodes/form values for supplier data. A late response cannot overwrite another edit, and applying a preview requires an explicit click. Existing native `append()` chaining errors in product and payable-order card rendering were also fixed and covered by regression tests.

## Activation steps

1. In `commerce-admin.html#warehouse`, complete the saved warehouse's receiving contact and phone, check the address/instructions, and mark it active.
2. Review the configured inclusive pricing policy. Verify each exact supplier variant, cost, currency conversion, stock/MOQ and source quote expiry before publishing its commerce entry.
3. Review the new `terms.html`, `shipping.html` and `returns.html` policies against the actual selling entity, ABN and commercial operation before taking payments. They preserve consumer guarantees and link to the ACCC, but publishing pages alone does not establish compliance. Confirm tax treatment and quote-specific lead times/cancellation arrangements. Finish SMTP as described below so customer signup and password recovery work for the intended recipients.
4. Configure **Supabase Edge Function secrets**, not frontend files: `STRIPE_SECRET_KEY` (prefer a restricted key), `STRIPE_WEBHOOK_SECRET` for this exact endpoint, `FI_PAYMENT_MODE=test`, `FI_SITE_URL=https://fabricationintelligence.com`. Keep `FI_CHECKOUT_ENABLED=false` until the endpoint and an authenticated test checkout have passed end to end. No new Stripe credentials were installed by this work.
5. Register `https://dszagdjnymxalpwamjyh.supabase.co/functions/v1/fi-stripe-webhook` in the matching Stripe environment for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, and `charge.dispute.created/updated/closed`.
6. Test valid/invalid signatures, successful and delayed payment, webhook-before-response races, repeated clicks, replay, refund/dispute holds and reconciliation. Only then enable test checkout, then separately configure and verify live keys and `FI_PAYMENT_MODE=live` before enabling live checkout. A test payment never releases physical purchasing or dispatch.
7. Supplier auto-buy is **not connected**. The saved URL is evidence and a manual purchase destination, not an API. Implement a supplier-supported ordering adapter with credentials, available stock/MOQ, current price checks, explicit cost limits, warehouse-only destination, idempotency and timeout reconciliation before enabling automation. No supplier purchases or money transfers were made.

## Auth email activation

Signup confirmation and password recovery remain blocked by the existing default-SMTP recipient restriction. No Resend key or custom SMTP credentials have been installed, and the website's email-setup notice remains visible.

Resend's email service was located through Stripe Directory. Stripe Projects preflight returned `BROWSER_AUTH_REQUIRED`, with the remedy `stripe projects init` to sign in. Per the Stripe Projects skill, provisioning stopped at that point; no plan, billable resource or provider account was purchased. The CLI is available here through `npx --yes @stripe/cli@1.53.1` if there is no global `stripe` command.

After that sign-in, retry the preflight and provision only the free Resend email plan. Verify a sender domain under FI's control using Resend's actual DNS records. Configure Supabase Auth custom SMTP with host `smtp.resend.com`, port `465`, username `resend`, the Resend API key as password, and a verified sender address/name. Store all keys outside the public repository. Keep signup confirmation enabled; do not bypass it to hide the delivery issue. Disable email link tracking so confirmation/recovery links are not rewritten. Check the production Site URL and redirect allowlist, send signup and recovery flows to an owner-authorized test mailbox, and confirm both complete before removing the notice. Provider acceptance alone does not prove inbox delivery.

References: [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Resend with Supabase SMTP](https://resend.com/docs/send-with-supabase-smtp). Analytics activation and the deferred message test are recorded in `observability/README.md`.

## Deliberate first-release limits

One fixed Checkout Session per order. Repeated attempts reuse its provider idempotency key and frozen payload. Expired/failed/uncertain sessions require operator reconciliation; no second charge is created automatically. Requotes, cancellation after a payable quote, automatic refunds and clearing financial holds are not available in the browser yet. Use Stripe for an approved refund; verified refund/dispute events update the ledger and retain the hold. Split deliveries, partially accepted quantities and multiple outbound parcels need a follow-up extension; this version requires the complete order to pass inspection.

Every ordered unit must pass the five recorded checks before outbound dispatch. Inspection can reduce defects; the website does not claim a 100% defect-free guarantee. Inspection results and shipping updates are entered by FI rather than inferred from payment events.

The existing static shop's Shopify/Payment Link paths and `fi_account_payments` history are separate legacy routes. They are not automatically connected to this ledger. Use the order catalogue and My orders for this warehouse flow.

## Review and validation

- All 141 JavaScript, FI Verify and catalogue integration tests passed after the supplier-link importer was added. `fi-product-import` passes Deno type checking and an unauthenticated hosted request returns 401. The signed-in production browser imported the supplied Dooroom URL, showed six supplier photos, matched the existing draft, and populated the editor with model A308B-191 and MOQ 2. The exact price remained blank, status stayed draft and both review checkboxes stayed unchecked. Photo selection updates the editor. Desktop and phone layouts were reviewed with no horizontal overflow or browser console errors. This live review did not save, publish or purchase the product. Versioned commerce asset URLs ensure returning visitors receive the new controls and rendering fixes.
- All 126 JavaScript, FI Verify and catalogue integration tests passed after the 8 October policy and analytics changes. The additional checks cover opt-in analytics, private-page exclusion, withdrawal and event data boundaries. The policy pages were also reviewed at desktop and phone widths. The commerce backend validation below was completed on 7 October; this update changes configuration and public pages, not the payment or database logic.
- All 32 existing Python importer/image-tool tests passed. Used the bundled Python runtime with missing test dependencies installed into a temporary directory; no global Python setup or product images were changed.
- Both Edge Functions pass Deno type checking with pinned Stripe 23.0.0 and Supabase JS 2.117.2; lockfiles are committed.
- `tests/commerce-rls.sql` passed against hosted Supabase, including request idempotency, inclusive totals, immutable quote approval, owner isolation, private supplier data, unauthorized RPC denial, unpaid/test payment blocks, payment replay, late failure handling, procurement duplication prevention, warehouse receipt, failed/missing inspection blocks, refund hold, correct destination and delivery. All fixtures were rolled back. Confirmed zero leftover QA users, zero real orders/payments and one unverified Alibaba draft.
- Public catalogue rendered in the browser, loaded six categories from Supabase, exposed no private draft and produced no browser console errors. Signed-out admin access redirects to login. Authenticated browser checkout and a real Stripe webhook are not yet verified; credentials and configuration are required.
- Supabase security advisor reports no commerce-schema security finding. Its existing [leaked-password protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) remains. New duplicate permissive policies were consolidated; existing unrelated policy/index advisories were preserved.

Run the site tests with `node --test tests/*.test.cjs fi-verify/*.test.cjs scripts/catalogue-integration.test.cjs`. Run the database test only with its final `rollback` retained. Do not create synthetic paid records outside that rollback test.
