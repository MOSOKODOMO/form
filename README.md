# Fabrication Intelligence

Bilingual construction sourcing website in development. The public product plan is in [SPEC.md](SPEC.md); current features, limitations and manual acceptance steps are in [project-planning/README.md](project-planning/README.md).

## Run the next-version preview

Run `node preview.mjs` and open http://127.0.0.1:4173/. No installation or build is required.

Build an RFQ → Review → Save RFQ locally → Send request. The staircase request ends with the same Send request button. Requests are posted through FormSubmit (formsubmit.co) and arrive by email at `FI_CONTACT_EMAIL` (`dist/contact.js`), with the visitor's email as reply-to. The first send from a new site address triggers a one-time FormSubmit activation email to that inbox. If sending fails, visitors see the error, a Copy request button and the contact address. Saved requests survive reload in this browser and show whether they were sent. Drawing filenames are text references only and no files are uploaded. The staircase catalogue remains available at /?view=catalogue.

Run storage checks with `node --test tests/rfq-store.test.cjs`.

## Publishing

The existing GitHub Actions workflow publishes dist on pushes to main. This next version has not been deployed. The full public website needs database/email delivery and domain setup before it can receive actual enquiries.
