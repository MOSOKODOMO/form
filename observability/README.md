# Optional FI Verify logging

`axiom.mjs` is a server-only adapter. Nothing is sent unless `AXIOM_API_TOKEN` and `AXIOM_DATASET` are set in the server environment. `AXIOM_DOMAIN` is optional and defaults to `api.axiom.co`. Never put the API token in `dist/` or commit it.

Connect it where a trusted server runs FI Verify:

```js
const fi = require('../fi-verify');
const { logFiVerifyRun } = await import('./axiom.mjs');
const service = fi.createService({ onEvent: logFiVerifyRun });
```

The adapter sends an allowlisted lifecycle event, status, counts, and duration only. It drops report IDs, names, source URLs, certificate numbers, reviewer details, and arbitrary extra fields. FI Verify does not yet run on a deployed server; this is a prepared integration, not live monitoring.

## Optional public website analytics

As of 8 October 2026, GA4 is **not active**. `dist/telemetry-config.js` has an empty public measurement ID and `experiment: null`. The owner deferred the research/message test. No experiment copy, cohort or success metric has been invented.

The Google Analytics setup was prepared in the signed-in browser for Fabrication Intelligence, Australia/Sydney reporting time, AUD, small business and Shopping. Optional Google account data sharing was deselected. Creation reached the Australian Terms of Service screen; no agreement was accepted and no property or web stream was confirmed created. An authorized account owner must accept those terms before setup continues.

Once the owner is ready:

1. Finish the GA4 account/property and create a website stream for `https://fabricationintelligence.com`. Turn **Enhanced measurement off**, including automatic page views, form interactions and outbound clicks. This integration sends a deliberately limited event set itself.
2. Put only the public `G-...` stream ID in `dist/telemetry-config.js`; no API secret belongs in `dist/`. Update the privacy notice's “not yet active” sentence when enabling it.
3. Check with a fresh browser on the production domain: no Google tag requests before consent, one page view after Allow analytics, and no events after No thanks. Private account/order/admin pages and preview hosts never load GA. The footer's Analytics choices button allows withdrawal.
4. Verify permitted events in GA4 Realtime/DebugView and consent withdrawal in the browser. Queries, hashes, referrers, form contents, customer/order identifiers and free-form event parameters must not appear. Turn off any newly enabled Google feature that bypasses these boundaries. Google still receives device/network information; this is explained in the privacy notice.
5. Resume the message test only after the owner provides its approved variants and success metric. Configure fixed, non-personal experiment/variant labels and copy in `experiment`. `message_view` records one impression when at least half the message is visible; `message_cta_click` records approved homepage CTAs. `generate_lead` fires only after the contact service confirms success. Analytics measures consenting visitors, so those events are not a count of all enquiries or sales. There is no purchase/revenue event wired to checkout in this release.

Consent is local to the browser. Analytics cookie lifetime is 90 days. Withdrawal disables analytics, clears `_ga` cookies and the optional session cohort, but does not delete events already received by Google. No consent-mode pings are sent before consent because the tag itself is not loaded.

Tests in `tests/telemetry.test.cjs` exercise the production/private-page boundaries, default opt-out, withdrawal, duplicate-event protection and removal of arbitrary data. Account setup and real GA delivery are separate activation checks, not proven by unit tests.
