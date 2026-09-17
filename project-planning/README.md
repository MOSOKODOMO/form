# Fabrication Intelligence — next website version

Decision: 17 September 2026. The product is a full public website at fabricationintelligence.com, built and tested in stages. The team personally manages sourcing. Only checked, real fabricators may appear as directory members. No online payments yet.

The existing code remains in `dist/` so the current preview and deployment workflow still work. This folder tracks the new plan. The user-provided SPEC.md and completed M1 directory were not present in this checkout; the scope below comes from the conversation.

## Implemented M2 subset

- English / Simplified Chinese RFQ brief: project name, category, material, unit quantity, dimensions with units, finish, drawing filename, target date, destination port and notes.
- Required fields, positive whole quantity, length limits, date and option validation.
- Review before saving; unique reference; browser-local saved request list; reopen and edit without creating a duplicate.
- Storage failure handling; invalid existing storage is not silently overwritten.
- Existing staircase catalogue and earlier request form remain available.

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

Public release is separate from this M2 browser-storage preview. GitHub Pages alone cannot execute the required database/email backend. The existing GitHub action publishes `dist/` on pushes to main; no deployment was performed for this change.

## Acceptance test

1. Open the preview, choose Build an RFQ, and submit an empty brief: required errors appear.
2. Fill every required field, enter a future delivery date and a drawing filename. Review and save locally.
3. Open My RFQs, reload, and open the saved request. All entered values and its reference remain.
4. Edit the quantity, review and save: the same reference updates without duplicating the request.
5. Switch EN / 中文 during editing; field values remain. Visit the catalogue and return; unsaved edits remain during the session.
6. Check negative/fractional quantities and past dates are rejected. Check phone-width layout.
7. Verify that no upload or sending confirmation is shown.

## Pilot preview fixes — 17 September (Prem)

- Requests now reach the team by email through FormSubmit: "Send request" on the saved RFQ view and the staircase review screen posts the full brief to `FI_CONTACT_EMAIL` (`dist/contact.js`), with the visitor's email as reply-to. (A first version used a mailto link, but it did nothing on laptops without a desktop email app.) Both forms now require the visitor's email and take an optional phone number. Failed sends show the error, a Copy request button and the contact address; saved RFQs record when they were sent. A proper backend (database + team email) is still needed for Stage 1, and a privacy page should mention FormSubmit.
- Contact email shown in the footer on every view and in the no-JavaScript message.
- One status label everywhere: "PILOT PREVIEW" (was "STAGE 1 · LOCAL TEST" and "M2 · BROWSER PROTOTYPE").
- Staircase image served as a 1200×800 JPEG (163 KB) instead of the 2.7 MB PNG. The PNG is kept for concept.html.
- Search description no longer says "prototype".
- Test added for email link encoding.

Still open (FI Tasks board): merge the two request forms, third-party catalogue photos, Home/How it works/About/Contact pages, builder-friendly fields and shorter references.

## Simple improvements — 17 September

My RFQs supports case-insensitive search by project, reference or material, with a result count and no-results message. Saved briefs can be downloaded as UTF-8 text in the selected language. Downloads include the reference, all brief fields and the local-only status; no drawing file is attached.
