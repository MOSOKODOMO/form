'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fi = require('./index.cjs');

const CHECKED_AT = '2026-10-05';
const HUMAN = { id: 'reviewer-1', name: 'Example Reviewer', role: 'human_reviewer' };
const MAKER = { name: 'Example Maker', website: 'https://example.com', productType: 'example category' };
const source = (path = '/evidence') => ({
  url: `https://example.com${path}`,
  title: `Example public page ${path}`,
  checkedAt: CHECKED_AT,
  access: 'public',
});
const registerSource = (path = '/register-match') => ({
  ...source(path),
  url: `https://example.org${path}`,
});
const draft = () => fi.createDraft(MAKER, { dateChecked: CHECKED_AT });

function minimumReport() {
  let report = draft();
  report = fi.setFinding(report, 'identity', {
    outcome: 'positive', summary: 'Public identity details matched the reviewed page.', sources: [source('/identity')],
  });
  report = fi.setFinding(report, 'redFlags', {
    outcome: 'positive', summary: 'No red flags were found on the reviewed public page.', sources: [source('/public-record')],
  });
  return report;
}

test('empty draft is unscored and cannot be published', () => {
  const report = draft();
  assert.equal(fi.calculateScore(report).value, null);
  assert.equal(fi.calculateScore(report).coveragePercent, 0);
  assert.throws(() => fi.approveReport(report, {
    reviewer: HUMAN, verdict: 'Pending review', decision: 'inconclusive',
  }), /documented identity/);
  assert.throws(() => fi.getPublicReport(report), /human-approved/);
});

test('not found is unknown; an approved report can state insufficient evidence', () => {
  let report = minimumReport();
  report = fi.setFinding(report, 'yearsTrading', {
    outcome: 'not_found', summary: 'A trading start date was not found on this public page.', sources: [source('/history')],
  });
  const score = fi.calculateScore(report);
  assert.equal(score.value, null);
  assert.equal(score.coveragePercent, 30);
  assert.equal(score.reason, 'Insufficient evidence');
  assert.equal(score.breakdown.find(category => category.key === 'makerCheck')
    .components.find(check => check.key === 'yearsTrading').assessed, false);
  assert.equal(score.breakdown.find(category => category.key === 'buyerExperience').summary, 'No reviews yet');
  assert.equal(score.provisional, true);

  const approved = fi.approveReport(report, {
    reviewer: HUMAN,
    verdict: 'Identity and checked pages have supporting evidence; trading history remains unknown.',
    decision: 'inconclusive',
    approvedAt: '2026-10-05T12:00:00.000Z',
  });
  const publicReport = fi.getPublicReport(approved, { asOf: CHECKED_AT });
  assert.equal(publicReport.status, 'approved');
  assert.equal(publicReport.score.value, null);
  assert.equal(publicReport.score.coveragePercent, 30);
  assert.equal(publicReport.sources.length, 3);
  assert.equal(publicReport.humanReviewer.id, HUMAN.id);
  assert.equal(publicReport.decision, 'inconclusive');
  assert.equal(publicReport.dateChecked, CHECKED_AT);
  assert.throws(() => fi.setFinding(approved, 'identity', {
    outcome: 'negative', summary: 'Changed', sources: [source()],
  }), /only a draft/);
});

test('negative assessed finding reduces the score while unknown does not', () => {
  let report = minimumReport();
  report = fi.setFinding(report, 'redFlags', {
    outcome: 'negative', summary: 'The checked public record contains an adverse finding.', sources: [source('/adverse')],
  });
  report = fi.setFinding(report, 'documents', {
    outcome: 'negative', summary: 'The reviewed document conflicts with the public register.', sources: [source('/documents')],
  });
  report = fi.setFinding(report, 'valueVsLocal', {
    outcome: 'positive', summary: 'The public comparison supports the stated value.', sources: [source('/comparison')],
  });
  report = fi.setFinding(report, 'yearsTrading', {
    outcome: 'not_found', summary: 'Trading history was not found on the checked page.', sources: [source('/history')],
  });
  const score = fi.calculateScore(report);
  assert.equal(score.value, 40);
  assert.equal(score.coveragePercent, 75);
  assert.equal(score.breakdown.find(category => category.key === 'buyerExperience').assessedWeight, 0);
  assert.throws(() => fi.setFinding(report, 'buyerExperience', {
    outcome: 'positive', summary: 'A review exists.', sources: [source('/review')],
  }), /remains unscored/);
});

test('a certificate needs a public register result and a human attestation to become Verified', () => {
  let report = fi.addCertificate(draft(), {
    type: 'Example certificate',
    number: 'EXAMPLE-123',
    issuer: 'Example Issuer',
    registerUrl: 'https://example.org/register',
    expiryDate: '2027-10-05',
    evidenceSource: source('/certificate'),
  });
  const id = report.certificates[0].id;
  assert.equal(fi.certificateStatus(report.certificates[0], CHECKED_AT), 'Not verified');
  assert.throws(() => fi.markCertificateVerified(report, id, {
    reviewer: HUMAN, checkedAt: CHECKED_AT, attestation: 'I matched the issuer and certificate number in its register.',
  }), /matching public issuer-register/);

  report = fi.recordRegisterCheck(report, id, {
    result: 'not_found', source: registerSource('/register-search'), checkedAt: CHECKED_AT,
    notes: 'No matching record appeared in this public search.',
  });
  assert.equal(fi.certificateStatus(report.certificates[0], CHECKED_AT), 'Not verified');
  assert.throws(() => fi.markCertificateVerified(report, id, {
    reviewer: HUMAN, checkedAt: CHECKED_AT, attestation: 'I matched the issuer and certificate number in its register.',
  }), /matching public issuer-register/);

  report = fi.recordRegisterCheck(report, id, {
    result: 'found', source: registerSource(), checkedAt: CHECKED_AT,
    notes: 'The public issuer register shows a matching number and issuer.',
  });
  assert.throws(() => fi.markCertificateVerified(report, id, {
    reviewer: { id: 'bot', name: 'Automated Research', role: 'automation' },
    checkedAt: CHECKED_AT,
    attestation: 'I matched the issuer and certificate number in its register.',
  }), /human_reviewer/);
  report = fi.markCertificateVerified(report, id, {
    reviewer: HUMAN,
    checkedAt: CHECKED_AT,
    attestation: 'I matched the issuer and certificate number in its public register.',
  });
  assert.equal(fi.certificateStatus(report.certificates[0], CHECKED_AT), 'Verified');
  assert.equal(fi.certificateStatus(report.certificates[0], '2027-10-06'), 'Expired');
});

test('a positive document finding needs a current human-verified certificate', () => {
  let report = minimumReport();
  assert.throws(() => fi.setFinding(report, 'documents', {
    outcome: 'positive', summary: 'Certificate checked.', sources: [source('/certificate')],
  }), /human-verified/);
  report = fi.addCertificate(report, {
    type: 'Example certificate', number: 'EXAMPLE-123', issuer: 'Example Issuer',
    registerUrl: 'https://example.org/register', expiryDate: '2026-10-06',
    evidenceSource: source('/certificate'),
  });
  const id = report.certificates[0].id;
  report = fi.recordRegisterCheck(report, id, {
    result: 'found', source: registerSource(), checkedAt: CHECKED_AT,
    notes: 'Issuer and number matched on the public register.',
  });
  report = fi.markCertificateVerified(report, id, {
    reviewer: HUMAN, checkedAt: CHECKED_AT,
    attestation: 'I matched the issuer and certificate number in its public register.',
  });
  report = fi.setFinding(report, 'documents', {
    outcome: 'positive', summary: 'A current certificate was confirmed in the issuer register.',
    sources: [registerSource()],
  });
  report = fi.setFinding(report, 'valueVsLocal', {
    outcome: 'positive', summary: 'A public local price comparison supports the stated value.',
    sources: [source('/comparison')],
  });
  assert.equal(fi.calculateScore(report).coveragePercent, 75);
  assert.throws(() => fi.approveReport(report, {
    reviewer: HUMAN, verdict: 'Certificate confirmed before expiry.', decision: 'verified',
    approvedAt: '2026-10-07T00:00:00.000Z',
  }), /no current human-verified certificate/);

  const approved = fi.approveReport(report, {
    reviewer: HUMAN, verdict: 'Certificate confirmed before expiry.', decision: 'verified',
    approvedAt: '2026-10-05T12:00:00.000Z',
  });
  const publicReport = fi.getPublicReport(approved, { asOf: '2026-10-07' });
  assert.equal(publicReport.certificates[0].status, 'Expired');
  assert.equal(publicReport.verificationCurrent, false);
  assert.equal(publicReport.score.value, 100);
  assert.equal(publicReport.decision, 'verified');
  assert.equal(publicReport.dateChecked, CHECKED_AT);
});

test('Australian test reports can support product proof without a certificate expiry date', () => {
  let report = minimumReport();
  report = fi.addTestReport(report, {
    type: 'Australian test report',
    number: 'EXAMPLE-TEST-123',
    lab: 'Example Lab',
    standard: 'Example Australian standard',
    testDate: '2026-09-20',
    reportSource: source('/test-report'),
    accreditationUrl: 'https://example.org/accreditation',
  });
  const id = report.testReports[0].id;
  assert.equal(report.testReports[0].accreditationExpiryDate, null);
  assert.equal(fi.testReportStatus(report.testReports[0], CHECKED_AT), 'Not verified');
  report = fi.recordLabAccreditationCheck(report, id, {
    result: 'not_found', source: registerSource('/accreditation-search'), checkedAt: CHECKED_AT,
    notes: 'The lab was not found in this public search.',
  });
  assert.throws(() => fi.markTestReportVerified(report, id, {
    reviewer: HUMAN, checkedAt: CHECKED_AT,
    attestation: 'I checked the public accreditation register for this lab and test scope.',
  }), /matching public lab-accreditation/);
  report = fi.recordLabAccreditationCheck(report, id, {
    result: 'found', source: registerSource('/accreditation-match'), checkedAt: CHECKED_AT,
    notes: 'The public accreditation register lists this lab and test scope.',
  });
  report = fi.markTestReportVerified(report, id, {
    reviewer: HUMAN, checkedAt: CHECKED_AT,
    attestation: 'I matched the lab and test scope in its public accreditation register.',
  });
  assert.equal(fi.testReportStatus(report.testReports[0], CHECKED_AT), 'Verified');
  report = fi.setFinding(report, 'documents', {
    outcome: 'positive', summary: 'The test report and lab accreditation were human reviewed.',
    sources: [source('/test-report'), registerSource('/accreditation-match')],
  });
  report = fi.setFinding(report, 'valueVsLocal', {
    outcome: 'positive', summary: 'A public local comparison supports the assessed value.',
    sources: [source('/comparison')],
  });
  const approved = fi.approveReport(report, {
    reviewer: HUMAN, verdict: 'Public evidence supports the maker and product.',
    decision: 'verified',
    approvedAt: '2026-10-05T12:00:00.000Z',
  });
  const publicReport = fi.getPublicReport(approved, { asOf: CHECKED_AT });
  assert.equal(publicReport.score.value, 100);
  assert.equal(publicReport.decision, 'verified');
  assert.equal(publicReport.testReports[0].status, 'Verified');
  assert.equal(publicReport.verificationCurrent, true);
  assert.equal(publicReport.sources.length, 5);
});

test('sources must be public URLs and every checked finding needs one', () => {
  assert.throws(() => fi.createDraft({ ...MAKER, website: 'file:///private/doc' }), /public HTTP/);
  assert.throws(() => fi.setFinding(draft(), 'identity', {
    outcome: 'positive', summary: 'Claimed verified', sources: [],
  }), /public source/);
  assert.throws(() => fi.setFinding(draft(), 'identity', {
    outcome: 'positive', summary: 'Claimed verified',
    sources: [{ ...source('/login'), url: 'https://example.com/login' }],
  }), /public HTTP/);
  assert.throws(() => fi.setFinding(draft(), 'identity', {
    outcome: 'positive', summary: 'Claimed verified',
    sources: [{ ...source(), access: 'private' }],
  }), /access must be public/);
});

test('register matches must link to the named issuer register', () => {
  const report = fi.addCertificate(draft(), {
    type: 'Example certificate', number: 'EXAMPLE-123', issuer: 'Example Issuer',
    registerUrl: 'https://example.org/register', expiryDate: '2027-10-05',
    evidenceSource: source('/certificate'),
  });
  assert.throws(() => fi.recordRegisterCheck(report, report.certificates[0].id, {
    result: 'found', source: source('/search-hit'), checkedAt: CHECKED_AT,
    notes: 'A generic search hit was found.',
  }), /named public register/);
});

test('publishing approval and a verified-maker decision are separate gates', () => {
  const report = minimumReport();
  assert.throws(() => fi.approveReport(report, {
    reviewer: HUMAN, verdict: 'More evidence needed.', decision: 'verified',
    approvedAt: '2026-10-05T12:00:00.000Z',
  }), /verified decision needs/);
  assert.throws(() => fi.approveReport(report, {
    reviewer: HUMAN, verdict: 'No adverse finding.', decision: 'not_verified',
    approvedAt: '2026-10-05T12:00:00.000Z',
  }), /documented adverse/);
  const approved = fi.approveReport(report, {
    reviewer: HUMAN, verdict: 'More evidence needed.', decision: 'inconclusive',
    approvedAt: '2026-10-05T12:00:00.000Z',
  });
  assert.equal(approved.status, 'approved');
  assert.equal(approved.decision, 'inconclusive');
  assert.equal(fi.getPublicReport(approved, { asOf: CHECKED_AT }).score.value, null);
});

test('service event boundary sends lifecycle metadata only', () => {
  const events = [];
  const service = fi.createService({ onEvent: event => events.push(event) });
  let report = service.createDraft(MAKER, { dateChecked: CHECKED_AT });
  report = service.setFinding(report, 'identity', {
    outcome: 'positive', summary: 'Identity matched.', sources: [source('/identity')],
  });
  assert.deepEqual(events.map(event => event.name), [
    'fi_verify.draft_created', 'fi_verify.finding_recorded',
  ]);
  assert.equal(events[0].reportId, report.id);
  assert.equal(JSON.stringify(events).includes('https://'), false);
});
