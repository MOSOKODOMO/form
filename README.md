# Fabrication Intelligence

A shop for design products from overseas makers we've checked: handles, knobs, tiles and taps first. Every product shows its FI Score out of 100 and the checks behind it. Live at https://fabricationintelligence.com/.

## What's on the site

- **Homepage, [Shop](dist/shop.html) and product pages.** Until the first real product is approved, the shop shows three products labelled SAMPLE. Their makers, scores and checks are made up, and they're not for sale.
- **[Rankings](dist/rankings.html)** lists live products by FI Score, or their makers by maker check. Each entry shows:
  - the score in four parts (maker check 40, product proof 30, value 15, buyers 15);
  - each check as Verified, Claimed, Failed or Not stated;
  - "No reviews yet. Early score, based on our research." until real reviews exist;
  - the date the score was checked.

  It reads only `dist/data/products.json`. Until a product is live, it shows the samples as a labelled example.
- **Buying.** Only a product set to `live` can be bought. Its product page uses, in order: a Shopify Buy Button, a Shopify product link, a Stripe Payment Link, or else "Request a quote" (the contact form, with the product filled in).
- **[How it works](dist/how-it-works.html), [Verified makers](dist/verified-makers.html) and [Partner with us](dist/partner.html)** came from the October marketplace preparation. The Verified makers directory reads `dist/data/makers.json` and `reports.json`, which stay empty until an FI Verify report is approved.
- **The earlier windows sourcing pilot** (Services, Pricing, the request form, the glass guide and [windows.html](dist/windows.html)) stays online, labelled as earlier work.

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

Historical notes are in [project-planning/README.md](project-planning/README.md), [WEEK-3-IMPLEMENTATION.md](project-planning/WEEK-3-IMPLEMENTATION.md) and [SPEC.md](SPEC.md).
