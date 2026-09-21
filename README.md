# Fabrication Intelligence

Bilingual construction sourcing website in development. The public product plan is in [SPEC.md](SPEC.md); current features, limitations and manual acceptance steps are in [project-planning/README.md](project-planning/README.md).

## Run the website preview

Run `node preview.mjs` and open http://127.0.0.1:4173/. No installation or build is required.

The homepage includes the Week 3 offer and a clearly labelled sample delivered-cost comparison. The canonical quote form is `stage2.html#request`; it stores requests in Supabase and uploads drawings to a private bucket. `auth.html` provides client/manufacturer sign-up and login, and `account.html` shows owned requests or a manufacturer application. The supplier workspace remains controlled by FI membership.

Run JavaScript checks with `node --test tests/*.test.cjs`. `tests/accounts-rls.sql` verifies database ownership and approval restrictions using temporary fixtures that are rolled back.

## Publishing

Source: https://github.com/MOSOKODOMO/form. The existing GitHub Actions workflow publishes `dist/` to https://fabricationintelligence.com/ on pushes to `main`. Vercel serves the same static site at https://fabrication-intelligence.vercel.app/ using `vercel.json`.

Supabase project `dszagdjnymxalpwamjyh` stores private request, account and manufacturer data. The account and supplier schemas were applied on 21 September 2026. Only the browser-safe publishable key is included in the website. No passwords, private customer records or service keys belong in GitHub.

Supabase's test email service is retained at the owner's request. Confirmation and magic-link emails are limited to authorized test recipients until a custom SMTP provider is configured. See [Week 3 implementation](project-planning/WEEK-3-IMPLEMENTATION.md) for details.
