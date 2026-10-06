# Warehouse commerce handoff

Updated 7 October 2026 (Australia/Sydney).

## Delivered

The user's model is retail procurement through FI: customer payment, supplier purchase, inbound delivery to FI's warehouse, inspection, then delivery to the customer. This supersedes the earlier immediate Connect supplier-split proposal for this workflow. No Connect transfer is made by this implementation.

- `commerce-admin.html`: FI-team-only source/product editor, importer draft upload, supporting references, warehouse address/contact editor, pricing policy, quotes, purchase references, inbound tracking, receipt, full inspection with private evidence uploads, outbound tracking and return/issue intake.
- `order-catalogue.html`: published commerce products grouped by category and authenticated delivery-address/quantity requests. The current static `shop.html`, rankings and existing extraction/image tools remain intact. A link from the shop opens the new order catalogue.
- `orders.html`: customer-owned orders, inclusive AUD total, payment state, refund totals and outbound tracking. Account links expose this flow; team accounts also get the warehouse/admin link.
- The existing `tools/add-product.py` output can be loaded into the admin product form. This is a review step, not automatic publication. Exact variants, prices, currency, evidence and image rights must be checked. The new browser workspace does not execute the local Python importer or automatically generate images.
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

## Pricing decision still needed

Confirmed: AUD and one inclusive displayed total. Markup is 10% of the source cost converted to AUD. All money is stored in integer cents; source unit conversion is rounded before multiplication by quantity, and markup is rounded on the source subtotal.

The owner has not yet answered whether additional costs are added inside the displayed total or absorbed inside source × 1.10. `fi_commerce_settings.pricing_mode` is deliberately unset, and quote approval fails until the owner chooses in **Warehouse & commerce → Pricing policy**:

- `costs_included`: source + 10% markup + inbound freight + inspection + outbound freight + duties + applicable tax + payment-cost allowance. $10 source and $4 other costs gives $15 total.
- `absorb_costs`: source × 1.10; other recorded costs reduce FI's contribution. The same example gives $11 revenue and a $3 loss before other overheads.

These are not automatic freight, tax or currency quotations. FI enters and approves current amounts, including explicit zero amounts, tax treatment and delivery scope. Destination-specific cost uncertainty is why the first version requests an inclusive quote before payment. A source price alone is not advertised as a final delivered price. No automatic tax registration or universal GST rate is assumed.

## Activation steps

1. In `commerce-admin.html#warehouse`, enter the actual receiving address, contact, phone and instructions; mark it active. Nothing has been guessed or seeded here.
2. Select the pricing policy. Verify each exact supplier variant, cost, currency conversion, stock/MOQ and source quote expiry before publishing its commerce entry.
3. Confirm commercial delivery/refund terms and tax treatment. Finish the existing SMTP setup so customer signup and password recovery work for the intended recipients.
4. Configure **Supabase Edge Function secrets**, not frontend files: `STRIPE_SECRET_KEY` (prefer a restricted key), `STRIPE_WEBHOOK_SECRET` for this exact endpoint, `FI_PAYMENT_MODE=test`, `FI_SITE_URL=https://fabricationintelligence.com`. Keep `FI_CHECKOUT_ENABLED=false` until the endpoint and an authenticated test checkout have passed end to end. No new Stripe credentials were installed by this work.
5. Register `https://dszagdjnymxalpwamjyh.supabase.co/functions/v1/fi-stripe-webhook` in the matching Stripe environment for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, and `charge.dispute.created/updated/closed`.
6. Test valid/invalid signatures, successful and delayed payment, webhook-before-response races, repeated clicks, replay, refund/dispute holds and reconciliation. Only then enable test checkout, then separately configure and verify live keys and `FI_PAYMENT_MODE=live` before enabling live checkout. A test payment never releases physical purchasing or dispatch.
7. Supplier auto-buy is **not connected**. The saved URL is evidence and a manual purchase destination, not an API. Implement a supplier-supported ordering adapter with credentials, available stock/MOQ, current price checks, explicit cost limits, warehouse-only destination, idempotency and timeout reconciliation before enabling automation. No supplier purchases or money transfers were made.

## Deliberate first-release limits

One fixed Checkout Session per order. Repeated attempts reuse its provider idempotency key and frozen payload. Expired/failed/uncertain sessions require operator reconciliation; no second charge is created automatically. Requotes, cancellation after a payable quote, automatic refunds and clearing financial holds are not available in the browser yet. Use Stripe for an approved refund; verified refund/dispute events update the ledger and retain the hold. Split deliveries, partially accepted quantities and multiple outbound parcels need a follow-up extension; this version requires the complete order to pass inspection.

Every ordered unit must pass the five recorded checks before outbound dispatch. Inspection can reduce defects; the website does not claim a 100% defect-free guarantee. Inspection results and shipping updates are entered by FI rather than inferred from payment events.

The existing static shop's Shopify/Payment Link paths and `fi_account_payments` history are separate legacy routes. They are not automatically connected to this ledger. Use the order catalogue and My orders for this warehouse flow.

## Review and validation

- All 123 JavaScript, FI Verify and catalogue integration tests passed on the current main-based worktree.
- All 32 existing Python importer/image-tool tests passed. Used the bundled Python runtime with missing test dependencies installed into a temporary directory; no global Python setup or product images were changed.
- Both Edge Functions pass Deno type checking with pinned Stripe 23.0.0 and Supabase JS 2.117.2; lockfiles are committed.
- `tests/commerce-rls.sql` passed against hosted Supabase, including request idempotency, inclusive totals, immutable quote approval, owner isolation, private supplier data, unauthorized RPC denial, unpaid/test payment blocks, payment replay, late failure handling, procurement duplication prevention, warehouse receipt, failed/missing inspection blocks, refund hold, correct destination and delivery. All fixtures were rolled back. Confirmed zero leftover QA users, zero real orders/payments and one unverified Alibaba draft.
- Public catalogue rendered in the browser, loaded six categories from Supabase, exposed no private draft and produced no browser console errors. Signed-out admin access redirects to login. Authenticated browser checkout and a real Stripe webhook are not yet verified; credentials and configuration are required.
- Supabase security advisor reports no commerce-schema security finding. Its existing [leaked-password protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) remains. New duplicate permissive policies were consolidated; existing unrelated policy/index advisories were preserved.

Run the site tests with `node --test tests/*.test.cjs fi-verify/*.test.cjs scripts/catalogue-integration.test.cjs`. Run the database test only with its final `rollback` retained. Do not create synthetic paid records outside that rollback test.
