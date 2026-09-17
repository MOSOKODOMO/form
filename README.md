# Fabrication Intelligence

Bilingual construction sourcing website in development. The public product plan is in [SPEC.md](SPEC.md); current features, limitations and manual acceptance steps are in [project-planning/README.md](project-planning/README.md).

## Run the next-version preview

Run `node preview.mjs` and open http://127.0.0.1:4173/. No installation or build is required.

Build an RFQ → Review → Save RFQ locally → My RFQs. Saved requests survive reload in this browser. Drawing filenames are text references only. No RFQs are sent and no files are uploaded. Fabricator selection awaits the checked directory. The staircase catalogue remains available at /?view=catalogue.

Run storage checks with `node --test tests/rfq-store.test.cjs`.

## Publishing

The existing GitHub Actions workflow publishes dist on pushes to main. This next version has not been deployed. The full public website needs database/email delivery and domain setup before it can receive actual enquiries.
