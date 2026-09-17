# Fabrication Intelligence — next website version

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

## Simple improvements — 17 September

My RFQs supports case-insensitive search by project, reference or material, with a result count and no-results message. Saved briefs can be downloaded as UTF-8 text in the selected language. Downloads include the reference, all brief fields and the local-only status; no drawing file is attached.
