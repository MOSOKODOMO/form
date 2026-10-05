// Server-side, opt-in logging for FI Verify. Never ship AXIOM_API_TOKEN in dist/.
const allowedStatuses = new Set(['draft', 'approved', 'rejected']);
const allowedEvents = new Set([
  'fi_verify.draft_created', 'fi_verify.finding_recorded', 'fi_verify.certificate_added',
  'fi_verify.test_report_added', 'fi_verify.lab_accreditation_checked',
  'fi_verify.test_report_verified', 'fi_verify.register_checked',
  'fi_verify.certificate_verified', 'fi_verify.report_approved',
]);

export async function logFiVerifyRun(event, {env = process.env, fetchImpl = fetch} = {}) {
  const token = env.AXIOM_API_TOKEN;
  const dataset = env.AXIOM_DATASET;
  const domain = env.AXIOM_DOMAIN || 'api.axiom.co';
  if (!token || !dataset) return {sent: false, reason: 'not_configured'};
  if (!/^[a-zA-Z0-9.-]+$/.test(domain) || !/^[a-zA-Z0-9_-]+$/.test(dataset)) {
    throw new Error('Invalid Axiom domain or dataset');
  }

  // Keep logs operational: no maker names, URLs, certificates or reviewer data.
  const row = {
    event: allowedEvents.has(event.name) ? event.name : 'fi_verify_run',
    time: new Date().toISOString(),
    status: allowedStatuses.has(event.status) ? event.status : event.name === 'fi_verify.report_approved' ? 'approved' : 'draft',
    source_count: nonNegativeInteger(event.sourceCount),
    certificate_count: nonNegativeInteger(event.certificateCount),
    duration_ms: nonNegativeInteger(event.durationMs),
  };
  const response = await fetchImpl(`https://${domain}/v1/ingest/${encodeURIComponent(dataset)}`, {
    method: 'POST',
    headers: {'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json'},
    body: JSON.stringify([row]),
  });
  if (!response.ok) throw new Error(`Axiom ingestion failed (${response.status})`);
  return {sent: true};
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}
