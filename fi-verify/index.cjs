'use strict';

const { randomUUID } = require('node:crypto');

const CHECK_WEIGHTS = Object.freeze({
  identity: 15,
  yearsTrading: 5,
  marketplaceAuditBadges: 5,
  documents: 30,
  redFlags: 15,
  valueVsLocal: 15,
  buyerExperience: 15,
});
const SCORE_CATEGORIES = Object.freeze({
  makerCheck: { weight: 40, checks: ['identity', 'yearsTrading', 'marketplaceAuditBadges', 'redFlags'] },
  productProof: { weight: 30, checks: ['documents'] },
  valueVsLocal: { weight: 15, checks: ['valueVsLocal'] },
  buyerExperience: { weight: 15, checks: ['buyerExperience'] },
});
const OUTCOMES = new Set(['not_checked', 'not_found', 'positive', 'negative']);
const REGISTER_RESULTS = new Set(['not_checked', 'found', 'not_found']);

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${label} must be non-empty text`);
  }
  return value.trim();
}

function dateOnly(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError(`${label} must be a YYYY-MM-DD date`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new TypeError(`${label} must be a valid date`);
  }
  return value;
}

function timestamp(value, label) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new TypeError(`${label} must be an ISO timestamp`);
  }
  return new Date(value).toISOString();
}

function publicUrl(value, label) {
  const input = requireText(value, label);
  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    throw new TypeError(`${label} must be a public HTTP(S) URL`);
  }
  const hostname = parsed.hostname.toLowerCase();
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password ||
    !hostname.includes('.') || hostname === 'localhost' || hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') || /^(127\.|10\.|192\.168\.|169\.254\.)/.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
    /\/(?:login|log-in|signin|sign-in|auth)(?:\/|$)/i.test(parsed.pathname)) {
    throw new TypeError(`${label} must be a public HTTP(S) URL without login credentials`);
  }
  return parsed.toString();
}

function normalizeSource(source, checkedAt) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError('source must be an object');
  }
  if (source.access !== 'public') {
    throw new TypeError('source access must be public');
  }
  return {
    url: publicUrl(source.url, 'source.url'),
    title: requireText(source.title, 'source.title'),
    checkedAt: dateOnly(source.checkedAt || checkedAt, 'source.checkedAt'),
    access: 'public',
  };
}

function normalizeReviewer(reviewer) {
  if (!reviewer || typeof reviewer !== 'object' || reviewer.role !== 'human_reviewer') {
    throw new TypeError('a human_reviewer actor is required');
  }
  return {
    id: requireText(reviewer.id, 'reviewer.id'),
    name: requireText(reviewer.name, 'reviewer.name'),
    role: 'human_reviewer',
  };
}

function editable(report) {
  if (!report || typeof report !== 'object' || report.status !== 'draft') {
    throw new Error('only a draft report can be changed');
  }
  return structuredClone(report);
}

function createDraft(maker, options = {}) {
  if (!maker || typeof maker !== 'object') {
    throw new TypeError('maker details are required');
  }
  const dateChecked = dateOnly(options.dateChecked || new Date().toISOString().slice(0, 10), 'dateChecked');
  return {
    schemaVersion: 1,
    id: randomUUID(),
    status: 'draft',
    maker: {
      name: requireText(maker.name, 'maker.name'),
      website: publicUrl(maker.website, 'maker.website'),
      productType: requireText(maker.productType, 'maker.productType'),
    },
    dateChecked,
    checks: Object.fromEntries(Object.keys(CHECK_WEIGHTS).map(key => [key, {
      outcome: 'not_checked',
      summary: key === 'buyerExperience' ? 'No reviews yet' : '',
      sources: [],
    }])),
    certificates: [],
    testReports: [],
    verdict: '',
    decision: null,
    humanReviewer: null,
  };
}

function certificateStatus(certificate, asOf = new Date().toISOString().slice(0, 10)) {
  dateOnly(asOf, 'asOf');
  if (certificate.expiryDate < asOf) return 'Expired';
  if (certificate.registerCheck?.result === 'found' &&
    certificate.registerCheck.checkedAt <= asOf &&
    certificate.humanVerification?.reviewer?.role === 'human_reviewer' &&
    typeof certificate.humanVerification.attestation === 'string' &&
    certificate.humanVerification.attestation.trim().length >= 20 &&
    certificate.humanVerification.checkedAt <= asOf) {
    return 'Verified';
  }
  return 'Not verified';
}

function testReportStatus(testReport, asOf = new Date().toISOString().slice(0, 10)) {
  dateOnly(asOf, 'asOf');
  if (testReport.accreditationExpiryDate && testReport.accreditationExpiryDate < asOf) return 'Expired';
  if (testReport.accreditationCheck?.result === 'found' &&
    testReport.accreditationCheck.checkedAt <= asOf &&
    testReport.humanVerification?.reviewer?.role === 'human_reviewer' &&
    typeof testReport.humanVerification.attestation === 'string' &&
    testReport.humanVerification.attestation.trim().length >= 20 &&
    testReport.humanVerification.checkedAt <= asOf) {
    return 'Verified';
  }
  return 'Not verified';
}

function hasVerifiedProductProof(report, asOf) {
  return report.certificates.some(certificate => certificateStatus(certificate, asOf) === 'Verified') ||
    report.testReports.some(testReport => testReportStatus(testReport, asOf) === 'Verified');
}

function setFinding(report, key, finding) {
  const next = editable(report);
  if (!Object.hasOwn(CHECK_WEIGHTS, key)) throw new TypeError(`unknown FI Verify check: ${key}`);
  if (!finding || typeof finding !== 'object' || !OUTCOMES.has(finding.outcome)) {
    throw new TypeError('finding.outcome must be not_checked, not_found, positive, or negative');
  }
  if (key === 'buyerExperience' && finding.outcome !== 'not_checked') {
    throw new Error('buyer experience remains unscored until verified buyer reviews are supported');
  }
  const sources = Array.isArray(finding.sources)
    ? finding.sources.map(source => normalizeSource(source, next.dateChecked))
    : [];
  const summary = finding.outcome === 'not_checked'
    ? (typeof finding.summary === 'string' ? finding.summary.trim() : '')
    : requireText(finding.summary, 'finding.summary');
  if (finding.outcome !== 'not_checked' && sources.length === 0) {
    throw new TypeError('a checked or not-found finding needs a public source');
  }
  for (const source of sources) {
    if (source.checkedAt > next.dateChecked) next.dateChecked = source.checkedAt;
  }
  if (key === 'documents' && finding.outcome === 'positive' &&
    !hasVerifiedProductProof(next, next.dateChecked)) {
    throw new Error('a positive document finding needs a human-verified certificate or accredited test report');
  }
  next.checks[key] = {
    outcome: finding.outcome,
    summary: key === 'buyerExperience' ? 'No reviews yet' : summary,
    sources,
  };
  return next;
}

function addCertificate(report, input) {
  const next = editable(report);
  if (!input || typeof input !== 'object') throw new TypeError('certificate details are required');
  const expiryDate = dateOnly(input.expiryDate, 'certificate.expiryDate');
  const certificate = {
    id: randomUUID(),
    type: requireText(input.type, 'certificate.type'),
    number: requireText(input.number, 'certificate.number'),
    issuer: requireText(input.issuer, 'certificate.issuer'),
    registerUrl: publicUrl(input.registerUrl, 'certificate.registerUrl'),
    expiryDate,
    evidenceSource: normalizeSource(input.evidenceSource, next.dateChecked),
    registerCheck: { result: 'not_checked', source: null, checkedAt: null, notes: '' },
    humanVerification: null,
  };
  next.certificates.push(certificate);
  if (certificate.evidenceSource.checkedAt > next.dateChecked) next.dateChecked = certificate.evidenceSource.checkedAt;
  return next;
}

function findCertificate(report, certificateId) {
  const certificate = report.certificates.find(item => item.id === certificateId);
  if (!certificate) throw new TypeError('certificate not found');
  return certificate;
}

function addTestReport(report, input) {
  const next = editable(report);
  if (!input || typeof input !== 'object') throw new TypeError('test report details are required');
  const testReport = {
    id: randomUUID(),
    type: requireText(input.type, 'testReport.type'),
    number: requireText(input.number, 'testReport.number'),
    lab: requireText(input.lab, 'testReport.lab'),
    standard: requireText(input.standard, 'testReport.standard'),
    testDate: dateOnly(input.testDate, 'testReport.testDate'),
    reportSource: normalizeSource(input.reportSource, next.dateChecked),
    accreditationUrl: publicUrl(input.accreditationUrl, 'testReport.accreditationUrl'),
    accreditationExpiryDate: input.accreditationExpiryDate
      ? dateOnly(input.accreditationExpiryDate, 'testReport.accreditationExpiryDate') : null,
    accreditationCheck: { result: 'not_checked', source: null, checkedAt: null, notes: '' },
    humanVerification: null,
  };
  next.testReports.push(testReport);
  if (testReport.reportSource.checkedAt > next.dateChecked) next.dateChecked = testReport.reportSource.checkedAt;
  return next;
}

function findTestReport(report, testReportId) {
  const testReport = report.testReports.find(item => item.id === testReportId);
  if (!testReport) throw new TypeError('test report not found');
  return testReport;
}

function recordLabAccreditationCheck(report, testReportId, input) {
  const next = editable(report);
  const testReport = findTestReport(next, testReportId);
  if (!input || typeof input !== 'object' || !REGISTER_RESULTS.has(input.result) || input.result === 'not_checked') {
    throw new TypeError('lab accreditation result must be found or not_found');
  }
  const checkedAt = dateOnly(input.checkedAt || next.dateChecked, 'accreditationCheck.checkedAt');
  const accreditationSource = normalizeSource(input.source, checkedAt);
  const accreditationHost = new URL(testReport.accreditationUrl).hostname;
  const sourceHost = new URL(accreditationSource.url).hostname;
  if (sourceHost !== accreditationHost && !sourceHost.endsWith(`.${accreditationHost}`)) {
    throw new TypeError('accreditation result source must be on the named public register');
  }
  testReport.accreditationCheck = {
    result: input.result,
    source: accreditationSource,
    checkedAt,
    notes: requireText(input.notes, 'accreditationCheck.notes'),
  };
  testReport.humanVerification = null;
  if (checkedAt > next.dateChecked) next.dateChecked = checkedAt;
  if (next.checks.documents.outcome === 'positive') {
    next.checks.documents = { outcome: 'not_checked', summary: '', sources: [] };
  }
  return next;
}

function markTestReportVerified(report, testReportId, input) {
  const next = editable(report);
  const testReport = findTestReport(next, testReportId);
  if (!input || typeof input !== 'object') throw new TypeError('test report verification details are required');
  const reviewer = normalizeReviewer(input.reviewer);
  const checkedAt = dateOnly(input.checkedAt || next.dateChecked, 'testReport.humanVerification.checkedAt');
  if (testReport.accreditationCheck.result !== 'found' || !testReport.accreditationCheck.source) {
    throw new Error('a matching public lab-accreditation result is required before human verification');
  }
  if (testReport.accreditationCheck.checkedAt > checkedAt || testReport.testDate > checkedAt) {
    throw new Error('test report verification cannot predate the accreditation check or test date');
  }
  if (testReport.accreditationExpiryDate && testReport.accreditationExpiryDate < checkedAt) {
    throw new Error('expired lab accreditation cannot support a Verified test report');
  }
  const attestation = requireText(input.attestation, 'testReport.humanVerification.attestation');
  if (attestation.length < 20) {
    throw new TypeError('test report verification needs a meaningful lab-accreditation attestation');
  }
  testReport.humanVerification = { reviewer, checkedAt, attestation };
  if (checkedAt > next.dateChecked) next.dateChecked = checkedAt;
  return next;
}

function recordRegisterCheck(report, certificateId, input) {
  const next = editable(report);
  const certificate = findCertificate(next, certificateId);
  if (!input || typeof input !== 'object' || !REGISTER_RESULTS.has(input.result) || input.result === 'not_checked') {
    throw new TypeError('register result must be found or not_found');
  }
  const checkedAt = dateOnly(input.checkedAt || next.dateChecked, 'registerCheck.checkedAt');
  const registerSource = normalizeSource(input.source, checkedAt);
  const registerHost = new URL(certificate.registerUrl).hostname;
  const sourceHost = new URL(registerSource.url).hostname;
  if (sourceHost !== registerHost && !sourceHost.endsWith(`.${registerHost}`)) {
    throw new TypeError('register result source must be on the named public register');
  }
  certificate.registerCheck = {
    result: input.result,
    source: registerSource,
    checkedAt,
    notes: requireText(input.notes, 'registerCheck.notes'),
  };
  if (checkedAt > next.dateChecked) next.dateChecked = checkedAt;
  // Any new register check invalidates an earlier human match until reviewed again.
  certificate.humanVerification = null;
  if (next.checks.documents.outcome === 'positive') {
    next.checks.documents = { outcome: 'not_checked', summary: '', sources: [] };
  }
  return next;
}

function markCertificateVerified(report, certificateId, input) {
  const next = editable(report);
  const certificate = findCertificate(next, certificateId);
  if (!input || typeof input !== 'object') throw new TypeError('verification details are required');
  const reviewer = normalizeReviewer(input.reviewer);
  const checkedAt = dateOnly(input.checkedAt || next.dateChecked, 'humanVerification.checkedAt');
  if (certificate.registerCheck.result !== 'found' || !certificate.registerCheck.source) {
    throw new Error('a matching public issuer-register result is required before human verification');
  }
  if (certificate.registerCheck.checkedAt > checkedAt) {
    throw new Error('human verification cannot predate the register check');
  }
  if (certificate.expiryDate < checkedAt) {
    throw new Error('an expired certificate cannot be marked Verified');
  }
  const attestation = requireText(input.attestation, 'humanVerification.attestation');
  if (attestation.length < 20) {
    throw new TypeError('human verification needs a meaningful register-match attestation');
  }
  certificate.humanVerification = { reviewer, checkedAt, attestation };
  if (checkedAt > next.dateChecked) next.dateChecked = checkedAt;
  return next;
}

function calculateScore(report) {
  if (!report || !report.checks) throw new TypeError('report checks are required');
  let assessedWeight = 0;
  let earnedWeight = 0;
  const components = Object.entries(CHECK_WEIGHTS).map(([key, weight]) => {
    const finding = report.checks[key];
    if (!finding || !OUTCOMES.has(finding.outcome)) throw new TypeError(`invalid finding for ${key}`);
    if (key === 'buyerExperience' && finding.outcome !== 'not_checked') {
      throw new Error('buyer experience remains unscored until verified buyer reviews are supported');
    }
    const assessed = finding.outcome === 'positive' || finding.outcome === 'negative';
    if (assessed) assessedWeight += weight;
    if (finding.outcome === 'positive') earnedWeight += weight;
    return {
      key,
      weight,
      outcome: finding.outcome,
      assessed,
      summary: finding.summary,
      sources: finding.sources,
    };
  });
  const breakdown = Object.entries(SCORE_CATEGORIES).map(([key, category]) => {
    const categoryComponents = category.checks.map(check => components.find(item => item.key === check));
    const categoryAssessedWeight = categoryComponents.filter(item => item.assessed).reduce((sum, item) => sum + item.weight, 0);
    const categoryEarnedWeight = categoryComponents.filter(item => item.outcome === 'positive').reduce((sum, item) => sum + item.weight, 0);
    return {
      key,
      weight: category.weight,
      assessedWeight: categoryAssessedWeight,
      earnedWeight: categoryEarnedWeight,
      assessed: categoryAssessedWeight === category.weight,
      outcome: categoryAssessedWeight === 0 ? 'not_checked' :
        categoryAssessedWeight === category.weight ? 'assessed' : 'partial',
      summary: key === 'buyerExperience' ? 'No reviews yet' : '',
      components: categoryComponents,
    };
  });
  const hasCoreEvidence = ['identity', 'redFlags', 'documents', 'valueVsLocal']
    .every(key => ['positive', 'negative'].includes(report.checks[key].outcome));
  const sufficient = assessedWeight >= 75 && hasCoreEvidence;
  return {
    value: sufficient ? Math.round(earnedWeight / assessedWeight * 100) : null,
    provisional: true,
    coveragePercent: assessedWeight,
    minimumCoveragePercent: 75,
    reason: sufficient ? null : 'Insufficient evidence',
    basis: 'assessed checks only',
    breakdown,
  };
}

function approveReport(report, input) {
  const next = editable(report);
  if (!input || typeof input !== 'object') throw new TypeError('approval details are required');
  const reviewer = normalizeReviewer(input.reviewer);
  const verdict = requireText(input.verdict, 'verdict');
  if (!['verified', 'not_verified', 'inconclusive'].includes(input.decision)) {
    throw new TypeError('decision must be verified, not_verified, or inconclusive');
  }
  const approvedAt = timestamp(input.approvedAt || new Date().toISOString(), 'approvedAt');
  if (approvedAt.slice(0, 10) < next.dateChecked) {
    throw new Error('approval cannot predate the report check');
  }
  if (next.checks.identity.outcome === 'not_checked' || next.checks.redFlags.outcome === 'not_checked') {
    throw new Error('approval needs documented identity and red-flag searches');
  }
  if (next.checks.documents.outcome === 'positive' &&
    !hasVerifiedProductProof(next, approvedAt.slice(0, 10))) {
    throw new Error('positive document finding has no current human-verified certificate or test report');
  }
  const score = calculateScore(next);
  const makerChecks = SCORE_CATEGORIES.makerCheck.checks;
  if (input.decision === 'verified' &&
    (score.value === null || next.checks.identity.outcome !== 'positive' ||
      next.checks.redFlags.outcome !== 'positive' || next.checks.documents.outcome !== 'positive' ||
      makerChecks.some(key => next.checks[key].outcome === 'negative'))) {
    throw new Error('verified decision needs sufficient score coverage, identity, product proof, and no adverse maker finding');
  }
  if (input.decision === 'not_verified' &&
    ![...makerChecks, 'documents'].some(key => next.checks[key].outcome === 'negative')) {
    throw new Error('not_verified decision needs a documented adverse maker or product-proof finding');
  }
  next.status = 'approved';
  next.verdict = verdict;
  next.decision = input.decision;
  next.humanReviewer = { ...reviewer, approvedAt };
  return next;
}

function getPublicReport(report, options = {}) {
  if (!report || report.status !== 'approved' || !report.humanReviewer) {
    throw new Error('only a human-approved report may be published');
  }
  const asOf = dateOnly(options.asOf || new Date().toISOString().slice(0, 10), 'asOf');
  const publicReport = structuredClone(report);
  publicReport.score = calculateScore(publicReport);
  publicReport.certificates = publicReport.certificates.map(certificate => ({
    ...certificate,
    status: certificateStatus(certificate, asOf),
  }));
  publicReport.testReports = publicReport.testReports.map(testReport => ({
    ...testReport,
    status: testReportStatus(testReport, asOf),
  }));
  publicReport.verificationCurrent = publicReport.decision === 'verified' &&
    hasVerifiedProductProof(publicReport, asOf);
  const sources = [];
  for (const finding of Object.values(publicReport.checks)) sources.push(...finding.sources);
  for (const certificate of publicReport.certificates) {
    sources.push(certificate.evidenceSource);
    if (certificate.registerCheck.source) sources.push(certificate.registerCheck.source);
  }
  for (const testReport of publicReport.testReports) {
    sources.push(testReport.reportSource);
    if (testReport.accreditationCheck.source) sources.push(testReport.accreditationCheck.source);
  }
  publicReport.sources = [...new Map(sources.map(source => [source.url, source])).values()];
  return publicReport;
}

function createService({ onEvent } = {}) {
  if (onEvent !== undefined && typeof onEvent !== 'function') {
    throw new TypeError('onEvent must be a function');
  }
  function emit(name, reportId) {
    if (!onEvent) return;
    try {
      const result = onEvent({ name, reportId, occurredAt: new Date().toISOString() });
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch {
      // Telemetry must not change report state transitions.
    }
  }
  return {
    createDraft(maker, options) {
      const result = createDraft(maker, options);
      emit('fi_verify.draft_created', result.id);
      return result;
    },
    setFinding(report, key, finding) {
      const result = setFinding(report, key, finding);
      emit('fi_verify.finding_recorded', result.id);
      return result;
    },
    addCertificate(report, input) {
      const result = addCertificate(report, input);
      emit('fi_verify.certificate_added', result.id);
      return result;
    },
    addTestReport(report, input) {
      const result = addTestReport(report, input);
      emit('fi_verify.test_report_added', result.id);
      return result;
    },
    recordLabAccreditationCheck(report, testReportId, input) {
      const result = recordLabAccreditationCheck(report, testReportId, input);
      emit('fi_verify.lab_accreditation_checked', result.id);
      return result;
    },
    markTestReportVerified(report, testReportId, input) {
      const result = markTestReportVerified(report, testReportId, input);
      emit('fi_verify.test_report_verified', result.id);
      return result;
    },
    recordRegisterCheck(report, certificateId, input) {
      const result = recordRegisterCheck(report, certificateId, input);
      emit('fi_verify.register_checked', result.id);
      return result;
    },
    markCertificateVerified(report, certificateId, input) {
      const result = markCertificateVerified(report, certificateId, input);
      emit('fi_verify.certificate_verified', result.id);
      return result;
    },
    approveReport(report, input) {
      const result = approveReport(report, input);
      emit('fi_verify.report_approved', result.id);
      return result;
    },
    calculateScore,
    getPublicReport,
  };
}

module.exports = {
  CHECK_WEIGHTS,
  SCORE_CATEGORIES,
  createDraft,
  setFinding,
  addCertificate,
  addTestReport,
  recordRegisterCheck,
  recordLabAccreditationCheck,
  markCertificateVerified,
  markTestReportVerified,
  certificateStatus,
  testReportStatus,
  calculateScore,
  approveReport,
  getPublicReport,
  createService,
};
