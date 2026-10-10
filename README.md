# Fabrication Intelligence

A curated store for mid-range to luxury design products from global manufacturers, with warehouse inspection before onward delivery. Live at https://fabricationintelligence.com/.

## Curated store and customer reviews: 10 October 2026

The homepage, shop, how-it-works, inspection service, About, contact and policies now describe the curated retail model. The fee is 10% of the manufacturer's initial product price converted to AUD; the agreed freight, inspection, duties and tax form one inclusive AUD total. The existing quote calculation already follows that rule. The database setting remains `costs_included`. China, Thailand and India describe the sourcing focus; each actual listing retains its source evidence.

[Product reviews](dist/reviews.html) replaces Pricing in navigation. The old pricing URL redirects to it. Historic sourcing-request URLs lead to the collection, and the window price comparison has been retired. Approved portraits, product renders and source disclosures remain intact. An order must pass the agreed inspection before dispatch; the public condition promise explains applicable remedies for defects or damage after delivery rather than promising that every hidden defect or transit incident is impossible.

The deployed `20261010120736_fi_verified_product_reviews.sql` migration stores public review content separately from its private purchase association. Authenticated RPCs check the customer's own order, a real payment (`livemode=true`) and a completed outbound delivery. Reviews publish regardless of rating; the owner can edit the same record, with one review per order item. Anonymous visitors can read display name, rating, title, text, product and dates, without account, order, payment or delivery identifiers. Customers explicitly consent before publication. A review does not automatically change the separate research FI Score.

Customers review from **My orders** or **Product reviews → Review your purchase**. In FI operations, the optional **Product page handle** connects a commerce product to its existing research product page; it is stored in product specifications as `catalogue_handle`. Confirm that both records describe the same product. The public order catalogue omits that internal linking field from its specification display.

Validation: all 126 JavaScript tests pass, including safe review rendering and filtered pagination. `supabase/tests/product_reviews.sql` passed on the hosted database and rolled back every fixture, including simulated payments. It verifies eligibility, cross-account denial, anonymous denial of submissions, direct-write denial, updates, genuine negative publication, summary counts and private purchase isolation. Desktop and mobile pages were visually reviewed. Supabase's authenticated SECURITY DEFINER warnings are intentional for these two constrained RPCs: public execution is revoked, callers are authenticated, `auth.uid()` is checked against the delivered purchase, and `search_path` is empty. The private purchase table deliberately has RLS with no client policies or grants. The pre-existing leaked-password-protection warning remains outside this change.

There are currently no real completed orders or reviews. The review page starts empty. Live checkout, supplier auto-purchasing and email-delivery activation remain separate launch gates; this update does not activate them or publish unconfirmed commerce drafts.

## Warehouse commerce: 7 October 2026

The new [FI commerce workspace](dist/commerce-admin.html) stores supplier links, reviewed products and evidence, receiving warehouses, inclusive AUD quotes, customer-owned orders, payment references, supplier purchases, inspections and both shipping legs in Supabase. [My orders](dist/orders.html) shows this flow; [the order catalogue](dist/order-catalogue.html) accepts requests for published commerce entries. The existing shop, rankings and local product/image tools are preserved, and importer JSON drafts can be loaded into the workspace for review.

The database and authenticated backend are deployed; live checkout and supplier auto-buy remain disabled. The warehouse address is recorded as 32 Velvet Road, Port Melbourne VIC 3207, and inclusive pricing is selected. Receiving still needs a confirmed warehouse contact and phone; Stripe also needs live configuration and verification. The supplied Alibaba link is saved as a private draft. See [the implementation and review handoff](project-planning/COMMERCE.md) for activation steps, exact boundaries and test results. This warehouse procurement model supersedes the earlier immediate supplier-split plan for these orders.

## What's on the site

- **Homepage, [Shop](dist/shop.html) and product pages.** The shop shows 21 supplier-research listings with source findings, outstanding checks and labelled AI catalogue renders. Three entries retain test checkout links; this is not live payment activation. The separate commerce catalogue contains only products approved for warehouse ordering.
- **[Rankings](dist/rankings.html)** lists live products by FI Score, or their makers by maker check. Each entry shows:
  - the score in four parts (maker check 40, product proof 30, value 15, buyers 15);
  - each check as Verified, Claimed, Failed or Not stated;
  - "No reviews yet. Early score, based on our research." until real reviews exist;
  - the date the score was checked.

  It reads only `dist/data/products.json`. Until a product is live, it shows the samples as a labelled example.
- **Buying.** Only a product set to `live` can be bought. Its product page uses, in order: a Shopify Buy Button, a Shopify product link, a Stripe Payment Link, or else "Request a quote" (the contact form, with the product filled in).
- **[How it works](dist/how-it-works.html), [Verified makers](dist/verified-makers.html) and [Partner with us](dist/partner.html)** came from the October marketplace preparation. The Verified makers directory reads `dist/data/makers.json` and `reports.json`, which stay empty until an FI Verify report is approved.
- **[Inspection service](dist/services.html) and [Product reviews](dist/reviews.html)** explain the current model. Historic request pages lead to the collection. [Windows](dist/windows.html) is a future-category note and the [glass guide](dist/glass-guide.html) remains educational.

## Preview and tests

Run `node preview.mjs`, then open http://127.0.0.1:4173/. No build is needed.

- Site, FI Verify and importer tests: `node --test tests/*.test.cjs fi-verify/*.test.cjs scripts/catalogue-integration.test.cjs`
- Product tools: `py -m unittest discover -s tests -p "test_*.py"`. The tools need Python 3 and `py -m pip install requests beautifulsoup4 pillow "rembg[cpu]"`. Playwright is optional, for pages that only work with JavaScript.

## Add a product

Nothing goes live automatically. Every product starts as a draft, and only a person can approve it.

1. `py tools/add-product.py <product page URL>` reads the page once, politely, and respects the site's robots.txt. It writes four things into `data/drafts/`, which is never published:
   - a draft;
   - the page text, so you can check every value;
   - a verify report with a link for checking each claim;
   - a Shopify import row.

   Anything the page doesn't say is "not stated". If a site blocks the tool or shows a CAPTCHA, save the page in your browser (Ctrl+S, "Webpage, complete") into `inbox/` and run `py tools/add-product.py --from-file inbox/<file>`.
2. Read `data/drafts/<handle>.verify.md`. Check each claim on the linked register, and record the result in the draft.
3. `py tools/make-images.py <handle>` saves the product's photos into `data/drafts/<handle>/source/`, for reference only. It then makes the shop image:
   - **With the maker's written permission** (`photo_permission` is `"yes"`): a studio image, cut out with rembg's U2-Net model (about 176 MB, downloaded once) and centred on #F6F2EA with a soft shadow. It writes `<handle>-2000.jpg` for Shopify and a 1200 px `<handle>.webp` under 300 KB for the site. Use `--source <file>` for a photo the maker sent you.
   - **Without permission:** a placeholder card. An AI render is optional: `--render-from <file>`, or `--ai-render` with `OPENROUTER_API_KEY` in `.env`. A render always carries a visible "Render" label, and it's only published once you confirm it looks like the real product.

   Either way, it writes alt text from the product facts.
4. `py tools/approve.py <handle>` asks you to confirm the price, the photo permission and the checkout link. The product then joins the shop as `approved`, with an early FI Score.
5. Paste checkout links into `data/checkout-links.csv` and run `py tools/apply-links.py`. Shopify product URLs and Stripe Payment Links are public, so they're safe here.
6. When it's ready to sell, set `"status": "live"` in `dist/data/products.json`. Run `py tools/check-products.py` before publishing. It also stops a supplier's photo going up without permission.
7. Push to `main`. The product appears in the shop with its Buy button, and in [Rankings](https://fabricationintelligence.com/rankings.html) by its FI Score.

## Ground rules

- No secret keys in the repo or in any file the browser loads. That means no Shopify Admin API token and no Stripe secret key. Tokens go in `.env`, which git ignores (see `.env.example`), and only the tools on your own computer use them.
- Never invent product facts, certificates, reviews, ratings, prices or delivery times.
- Never publish a supplier's photo unless `photo_permission` is `"yes"` (we have it in writing).
- AI-made images must look like the real product and carry a visible "Render" label.

## Other tools from the marketplace preparation

- `fi-verify/` is an offline library for maker reports with human approval. See its [README](fi-verify/README.md).
- `scripts/import-product-sheet.cjs` imports the FI Product Sheet export into `data/product-sheet/`, which is never published, for a person to review. It doesn't write the shop catalogue. See [catalogue-data.md](project-planning/catalogue-data.md).
- `supabase/migrations/20261005033831_fi_marketplace_catalogue.sql` is prepared but **not applied**. The site doesn't query those tables.
- `dist/telemetry.js` is a Google Analytics 4 hook. It sends nothing until a measurement ID is set in that file. Update the privacy page before setting one.
- The [Axiom logger](observability/README.md) is opt-in and server-only.

The feedback form sends answers to the team inbox through FormSubmit.

## Publishing and environment

GitHub Actions publishes `dist/` to https://fabricationintelligence.com/ on every push to `main`. Vercel's configuration is in `vercel.json`, but its alias can lag behind, so use the custom domain. See the [deployment notes](project-planning/DEPLOYMENT.md).

The Supabase project `dszagdjnymxalpwamjyh` stores private request, account and manufacturer data. Only the browser-safe publishable key belongs in the website. Never commit service keys, private customer records or unpublished research notes.

### Historical accounts and payment readiness — 5 October 2026

The payment-backend status and proposed supplier-split approach below describe the earlier release; see the 7 October warehouse commerce section above for the current implementation.

- Restored the existing Supabase project. `auth.html` supports email/password sign-in, signup confirmation and password recovery. `account.html` supports editing your own name/company and preserves client requests and manufacturer applications.
- Set Auth Site URL to `https://fabricationintelligence.com` and added the exact recovery redirect `https://fabricationintelligence.com/auth.html?mode=reset`. Existing redirect entries were preserved.
- Applied `supabase/migrations/20261005110903_fi_account_payment_history.sql`. Profile updates are restricted to display fields. `fi_account_payments` is an empty, server-write-only/customer-read-own history table, not a checkout API or authoritative payable-order ledger. Card details never belong in this table.
- **Email launch gate:** custom SMTP is not configured. Public signup and recovery email delivery are not production-verified. Configure a sender and test confirmation/recovery before inviting customers; do not disable email confirmation to bypass this.
- **Payments are not live.** The available local Stripe key is test-only; no payment backend or webhook has been deployed. No products, prices, charges, suppliers or payout accounts were created by this account update. Existing public checkout-link tooling is not linked to Supabase payment history and must not be treated as the automatic supplier-split integration.
- Suppliers are expected from China, Thailand and India; confirm each actual legal payee country and bank country. Stripe does not document a self-serve AU-platform cross-border destination-charge route preserving FI as the business of record for that setup. Obtain account-specific eligibility confirmation before selecting a payout route: [cross-border payouts](https://docs.stripe.com/connect/cross-border-payouts#availability), [destination charges](https://docs.stripe.com/connect/destination-charges).
- Once eligibility is resolved: finish live Stripe activation; agree FI fees/tax and payment/refund terms; build server-owned accepted quotes/orders/payment obligations, authenticated Checkout creation and signed idempotent webhooks including refunds/disputes. Configure a restricted live key and webhook signing secret only in the backend secret store, never in chat or frontend files. A return-page URL must never mark an order paid.
- Database verification: `supabase/tests/account_payment_history.sql` uses transaction-only fixtures and rolls back. It checks signup profile creation, owner access, name updates, forbidden role/payment writes and anonymous denial. Frontend tests are in `tests/account-frontend.test.cjs`. Live email delivery and end-to-end checkout remain unverified.

Historical notes are in [project-planning/README.md](project-planning/README.md), [WEEK-3-IMPLEMENTATION.md](project-planning/WEEK-3-IMPLEMENTATION.md) and [SPEC.md](SPEC.md).
