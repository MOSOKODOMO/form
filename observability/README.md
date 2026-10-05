# Optional FI Verify logging

`axiom.mjs` is a server-only adapter. Nothing is sent unless `AXIOM_API_TOKEN` and `AXIOM_DATASET` are set in the server environment. `AXIOM_DOMAIN` is optional and defaults to `api.axiom.co`. Never put the API token in `dist/` or commit it.

Connect it where a trusted server runs FI Verify:

```js
const fi = require('../fi-verify');
const { logFiVerifyRun } = await import('./axiom.mjs');
const service = fi.createService({ onEvent: logFiVerifyRun });
```

The adapter sends an allowlisted lifecycle event, status, counts, and duration only. It drops report IDs, names, source URLs, certificate numbers, reviewer details, and arbitrary extra fields. FI Verify does not yet run on a deployed server; this is a prepared integration, not live monitoring.
