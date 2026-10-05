# FI Verify v0

This directory contains a product-free, offline evidence and approval scaffold. It does not crawl websites or verify any real maker. It is intended to produce approved public reports for a future catalogue import.

## Use

```js
const fi = require('./fi-verify');
const draft = fi.createDraft({
  name: 'Example Maker',
  website: 'https://example.com',
  productType: 'example category'
});
```

The example is fictional. See `example-draft.json` for the shape of an empty draft. A later importer can call `getPublicReport(approvedReport)` and append the result to `dist/data/reports.json`. Products should reference its `id` as `reportId`.

The Notion rubric is maker check (40 points), product proof (30), value vs local (15), and buyer experience (15). Maker check consists of identity (15), years trading (5), marketplace audit badges (5), and public red-flag review (15). Product proof is the document/certificate check (30). A finding has an outcome of `positive`, `negative`, `not_found`, or `not_checked`. `not_found` and `not_checked` are unknown, not failed, and do not lower the score. The score is a rounded percentage of **assessed** weight, with coverage shown against the full 100-point rubric. A numeric score requires at least 75% coverage and assessed identity, red flags, product proof, and value-vs-local checks. Otherwise `score.value` is `null` with reason `Insufficient evidence`. Buyer experience is locked to `No reviews yet` in v0; no unverified reviews can earn points. Every published score is labelled provisional.

For any assessed or `not_found` finding, record a plain-English summary and at least one linked, public source. A document finding of `positive` needs a human-verified certificate or accredited test report. FI Verify stores certificate type, number, issuer, register URL, expiry date, and evidence source. A register result of `not_found` leaves the certificate `Not verified`. The register-result link must be on the named register host. The `Verified` transition requires a human reviewer to record a matching issuer-register result and an attestation. Expired dates display `Expired` even if the certificate was formerly verified. Australian test reports have their own record with report number, lab, standard, test date, report source, lab accreditation URL, and optional accreditation expiry. A human reviewer must confirm the lab's public accreditation and relevant scope before marking the test report `Verified`.

`approveReport` requires a human reviewer, plain-English verdict, an explicit `decision`, documented identity and red-flag searches, and a recorded check date. It can approve an honest `Insufficient evidence` report with no numeric score and an `inconclusive` decision. `status: 'approved'` means a person approved publication; it does **not** mean the maker passed. Show a current Verified Makers badge only for `decision: 'verified'` **and** `verificationCurrent: true`; this becomes false when all supporting certificate or lab-accreditation proof has expired. A verified decision requires enough evidence, a positive identity and product-proof check, and no adverse maker finding. A `not_verified` decision requires a documented adverse maker or product-proof finding, never mere absence of evidence. `getPublicReport` only serializes approved reports. The module rejects edits after approval. A draft report cannot enter the public catalogue.

This v0 library verifies the **shape and transition rules**, not a person's real-world identity or whether a URL is truly public. The future authenticated server must derive the reviewer role from its own session, keep drafts private, and enforce approval authorization. Researchers should consult public pages only; no login pages, account access, or bulk scraping. Use the issuer's actual public register, such as IAF CertSearch for applicable ISO certifications or the appropriate Australian register, and preserve the exact source link. A generic search hit is not register confirmation.

## API

- `createDraft({ name, website, productType }, { dateChecked? })`
- `setFinding(draft, key, { outcome, summary, sources })`
- `addCertificate(draft, { type, number, issuer, registerUrl, expiryDate, evidenceSource })`
- `recordRegisterCheck(draft, certificateId, { result, source, checkedAt, notes })`
- `markCertificateVerified(draft, certificateId, { reviewer, checkedAt, attestation })`
- `addTestReport(draft, { type, number, lab, standard, testDate, reportSource, accreditationUrl, accreditationExpiryDate? })`
- `recordLabAccreditationCheck(draft, testReportId, { result, source, checkedAt, notes })`
- `markTestReportVerified(draft, testReportId, { reviewer, checkedAt, attestation })`
- `calculateScore(report)`
- `approveReport(draft, { reviewer, verdict, decision, approvedAt? })`
- `getPublicReport(approvedReport)`
- `createService({ onEvent })` is an optional wrapper for logging safe lifecycle events to an outside adapter. It does not send data itself.

Each method returns a new object. Save drafts and approved reports in separate, access-controlled storage when persistence is added.

Run the standalone tests with `node --test fi-verify/*.test.cjs`.
