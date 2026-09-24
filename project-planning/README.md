# Fabrication Intelligence: next website version

Current status (21 September 2026): the Week 3 public pages and account flows are implemented; account and supplier schemas are installed in Supabase. See [WEEK-3-IMPLEMENTATION.md](WEEK-3-IMPLEMENTATION.md) for the current release. Earlier sections below retain the development history.

Decision: 17 September 2026. The product is a full public website at fabricationintelligence.com, built and tested in stages. The team personally manages sourcing. Only checked, real fabricators may appear as directory members. No online payments yet.

The existing code remains in `dist/` so the current preview and deployment workflow still work. This folder tracks the new plan. The user-provided SPEC.md and completed M1 directory were not present in this checkout; the scope below comes from the conversation.

## Implemented M2 subset

- English / Simplified Chinese RFQ brief: project name, category, material, unit quantity, dimensions with units, finish, drawing filename, target date, destination port and notes.
- Required fields, positive whole quantity, length limits, date and option validation.
- Review before saving; unique reference; browser-local saved request list; reopen and edit without creating a duplicate.
- Storage failure handling; invalid existing storage is not silently overwritten.
- Existing staircase catalogue and earlier request form remain available.

## Stage 2 demo deployed

- `stage2.html` is a public detailed quote-request portal for the Stage 2 demo.
- Requests are stored in Supabase in `public.fi_quote_requests` with generated `FI-YYYYMMDD-XXXXXX` references.
- Drawing files upload to the private `fi-drawings` bucket with a 10 MB limit and authenticated team-only reads.
- The team admin board supports `New`, `Quoting`, `Quotes sent`, `Won` and `Lost`, with row-level security on team membership and requests.
- GitHub Pages continues to serve the static client from `dist/`; the Supabase client uses only the browser-safe publishable key.
- The portal intentionally does not claim team email delivery yet; email notifications and production spam controls remain follow-up work.

Drawing filename means text only, not an uploaded drawing. Requests are never sent. Unsaved form edits survive switching tabs/language but not reload. Saved RFQs survive reload in the same browser and origin. Changing port, browser or domain does not migrate data.

## Pending M2 connection

Fabricator selection requires a checked directory dataset. No companies or verification claims have been invented. Recipient selection and its persistence remain to be implemented when that dataset is available.

## Stage 3 supplier workspace: ready to configure

- `dist/supplier-portal.html` is an invitation-only English / Simplified Chinese workspace for supplier company profiles and catalogue submissions.
- A supplier can update only its own profile, add products, attach private images/PDF/DOCX files (10 MB each), and submit its information for FI review.
- FI team members use the same page to create a supplier record, see submitted profiles/products, and set `In review`, `Changes requested`, `Approved` or `Not approved`. Supplier-editable data and FI-controlled approval records are separate, so a supplier cannot self-approve.
- The database migration is `supabase/migrations/20260920012456_fi_supplier_portal.sql`. It was applied to the hosted Supabase project on 21 September 2026.
- Before inviting a supplier, add the portal URL to Supabase Auth's allowed redirect URLs, make sure the new tables are exposed through the Data API if the project requires explicit exposure, and create the supplier's Auth user in the Supabase Dashboard. The supplier portal deliberately calls `signInWithOtp` with `shouldCreateUser: false`.

## Public website stages

1. Home, How it works, Who it's for, About (RMIT architecture student founders), Contact, Privacy; real quote form with database and team email delivery; custom domain and phone testing.
2. Detailed brief, secure drawing uploads, reference numbers and authenticated team admin (New → Quoting → Quotes sent → Won/Lost).
3. Checked fabricator directory, Verified by FI page, apply-to-join form.
4. Customer accounts, request history, quote comparison in AUD landed cost; acceptance notifies team.
5. Later: deposits, fabricator portal, order timeline, configurator, supply chain map and AI assistance.

## Hardest work

- Secure file storage: limits, file validation, access permissions and retention.
- Reliable request delivery: database writes, server validation, spam controls, email retries and avoiding duplicate sends.
- Authentication and permissions: separate customers and team members; protect each request and drawing.
- Comparable costs: quantities, currency conversion, freight, duties, GST, installation and quote validity must use an agreed scope.
- Verification: real evidence and a maintained review process, not just a badge in code.

The Stage 2 demo is separate from the earlier M2 browser-storage preview. GitHub Pages serves the static client while Supabase provides the database, private storage and authenticated admin data access. The existing GitHub action publishes `dist/` on pushes to main. Production hardening still includes email delivery, spam controls, retention and the final admin team-member setup.

## Acceptance test

1. Open the preview, choose Build an RFQ, and submit an empty brief: required errors appear.
2. Fill every required field, enter a future delivery date and a drawing filename. Review and save locally.
3. Open My RFQs, reload, and open the saved request. All entered values and its reference remain.
4. Edit the quantity, review and save: the same reference updates without duplicating the request.
5. Switch EN / 中文 during editing; field values remain. Visit the catalogue and return; unsaved edits remain during the session.
6. Check negative/fractional quantities and past dates are rejected. Check phone-width layout.
7. Verify that no upload or sending confirmation is shown.

## Pilot preview fixes, 17 September (Prem)

- Requests now reach the team by email through FormSubmit: "Send request" on the saved RFQ view and the staircase review screen posts the full brief to `FI_CONTACT_EMAIL` (`dist/contact.js`), with the visitor's email as reply-to. (A first version used a mailto link, but it did nothing on laptops without a desktop email app.) Both forms now require the visitor's email and take an optional phone number. Failed sends show the error, a Copy request button and the contact address; saved RFQs record when they were sent. A proper backend (database + team email) is still needed for Stage 1, and a privacy page should mention FormSubmit.
- Contact email shown in the footer on every view and in the no-JavaScript message.
- One status label everywhere: "PILOT PREVIEW" (was "STAGE 1 · LOCAL TEST" and "M2 · BROWSER PROTOTYPE").
- Staircase image served as a 1200×800 JPEG (163 KB) instead of the 2.7 MB PNG. The PNG is kept for concept.html.
- Search description no longer says "prototype".
- Test added for email link encoding.

Still open (FI Tasks board): merge the two request forms, third-party catalogue photos, Home/How it works/About/Contact pages, builder-friendly fields and shorter references.

## Simple improvements, 17 September

My RFQs supports case-insensitive search by project, reference or material, with a result count and no-results message. Saved briefs can be downloaded as UTF-8 text in the selected language. Downloads include the reference, all brief fields and the local-only status; no drawing file is attached.
