# Week 3 website implementation

## Completed in the site

- The approved offer one-pager is now the homepage: “Send us the thing you can’t source.”
- A single, canonical quote-request flow replaces the two public request forms.
- The sample comparison shows three side-by-side quotes and the complete delivered-cost scope in AUD. Every number is labelled as sample data.
- Added Home, How it works, Services, About, Contact and Privacy pages with consistent naming and navigation.
- Added client and manufacturer email/password sign-up and login.
- Client accounts can see quote requests submitted while signed in.
- Manufacturer accounts can save an application draft and submit it for FI review.
- Manufacturer self-sign-up does not create supplier access. FI must separately approve the application and create a supplier membership.
- Added row-level security policies so account data is scoped to the signed-in user, while FI team access remains controlled by the existing team-members table.

## Deployment status — 21 September 2026

- Applied the account and supplier schemas to the existing Supabase project `dszagdjnymxalpwamjyh`.
- Supabase security advisor reports no findings. Transactional integration checks verify ownership isolation, valid submission requirements and blocked self-approval; all fixtures are rolled back.
- GitHub stores the website source and schema scripts. Private account/request data stays in Supabase.
- Vercel project: `fabrication-intelligence` in team `moso6`. `vercel.json` serves the `dist` directory without a build step.
- Supabase test email delivery is retained at the owner's explicit request. Public confirmation delivery requires a custom SMTP provider later.
- Direct GitHub-to-Vercel linking requires the owner to add the GitHub login connection in Vercel. This release can be deployed from the same checked source without that integration.

## Setup for another environment

1. Apply `supabase/fi-stage2.sql` if the quote-request database is not already installed.
2. Apply `supabase/fi-accounts.sql` in the Supabase SQL editor.
3. If using the supplier workspace, also apply the existing supplier-portal migration in `supabase/migrations/`.
4. In Supabase Auth, add the production website URL and `/account.html` to the allowed redirect URLs.
5. Configure a production SMTP provider before inviting real users. Supabase’s default mail service is only suitable for limited testing.
6. If the project uses explicit Data API exposure, expose the new account tables after applying the SQL. RLS and grants in the script still govern access.

## Human follow-ups

- Replace the numbered team portraits with the three approved headshots when supplied.
- Record the short backup demo clip for the presentation.
- Complete and log the Week 3 interview/outreach targets; the website does not fabricate these activities.
- Review the Privacy page with the team before public launch and add any required business or legal details.

## 24 September 2026 — pitch-day fixes

- The request form lists **Windows & glazing** first. Until the database allows it, windows requests save as `other` with "Category: Windows & glazing" at the top of the notes, so submissions never fail.
- **Moss: run `supabase/migrations/20260924050000_fi_windows_category.sql` in the Supabase SQL editor** so windows requests keep their own category. Supplier catalogue items still use the old category list.
- Every saved request also emails the team a copy through FormSubmit. Drawings stay in Supabase. The Privacy page says so.
- The team contact address is now **fabricationintelligence@gmail.com** everywhere on the site (Contact page, Privacy page, request alerts). FormSubmit needs a one-time activation for a new address: the first submission sends an "Activate Form" email to that inbox, and alerts arrive only after someone clicks it.
- "What happens next" now promises a reply within 48 hours. Quotes are still promised within 7 days.
- Team portraits are 720 px JPEGs (about 48 KB each instead of about 1.9 MB).
- New **Pricing** page (`pricing.html`): comparisons are free; the fee is 10% of the delivered cost, only when an order goes ahead, waived for the first 10 projects. Product and delivery costs pass through at cost, itemised. It's in every page's menu, and the Services page links to it.
- New **1-minute feedback form** (`feedback.html`, `feedback.js`): role, ease of use, would they use it, reaction to the 10% fee, and what to source next. Answers email the team through FormSubmit. It's linked from the request confirmation and the homepage footer, for user testing and the pitch QR code.
