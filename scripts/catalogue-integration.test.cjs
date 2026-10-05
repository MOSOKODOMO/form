'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const fi = require('../fi-verify/index.cjs');
const catalog = require('../dist/catalog.js');
const importer = require('./import-product-sheet.cjs');

test('the importer never writes over the shop catalogue by default', () => {
  const source = fs.readFileSync(path.join(__dirname, 'import-product-sheet.cjs'), 'utf8');
  assert.ok(source.includes("const defaultOutDir = path.join(root, 'data', 'product-sheet');"));
  assert.ok(source.includes('outDir: defaultOutDir'));
});

const checked = new Date().toISOString().slice(0, 10);
const human = { id: 'fixture-reviewer', name: 'Fixture Reviewer', role: 'human_reviewer' };
const maker = { name: 'Fixture Maker', website: 'https://example.com', productType: 'Tiles' };
const source = (name, host = 'example.com') => ({
  url: `https://${host}/${name}`, title: `Fixture ${name}`, checkedAt: checked, access: 'public',
});

function publicReport() {
  let report = fi.createDraft(maker, { dateChecked: checked });
  report = fi.setFinding(report, 'identity', { outcome: 'positive', summary: 'Fixture identity matched.', sources: [source('identity')] });
  report = fi.setFinding(report, 'redFlags', { outcome: 'positive', summary: 'Fixture public record checked.', sources: [source('record')] });
  report = fi.addTestReport(report, {
    type: 'Fixture test', number: 'TEST-1', lab: 'Fixture Lab', standard: 'Fixture standard', testDate: checked,
    reportSource: source('test'), accreditationUrl: 'https://example.org/accreditation',
  });
  const testId = report.testReports[0].id;
  report = fi.recordLabAccreditationCheck(report, testId, {
    result: 'found', source: source('accreditation-result', 'example.org'), checkedAt: checked,
    notes: 'Fixture lab and scope matched.',
  });
  report = fi.markTestReportVerified(report, testId, {
    reviewer: human, checkedAt: checked, attestation: 'I checked the fixture lab and scope in the public register.',
  });
  report = fi.setFinding(report, 'documents', {
    outcome: 'positive', summary: 'Fixture report and accreditation checked.', sources: [source('test')],
  });
  report = fi.setFinding(report, 'valueVsLocal', {
    outcome: 'positive', summary: 'Fixture comparison checked.', sources: [source('comparison')],
  });
  const approved = fi.approveReport(report, {
    reviewer: human, verdict: 'Fixture evidence supports the maker and product type.', decision: 'verified',
    approvedAt: `${checked}T12:00:00.000Z`,
  });
  return fi.getPublicReport(approved, { asOf: checked });
}

function sheetRows(report) {
  const headers = fs.readFileSync(path.join(__dirname, 'product-sheet-template.csv'), 'utf8').trim().split(',');
  const values = {
    Product: 'Fixture tile', Category: 'Tiles', Country: 'Fixtureland', 'FI Score': '999',
    Maker: maker.name, 'Maker URL': maker.website, 'Photo URL': 'https://example.com/fixture.webp',
    'Photo permission': 'Yes', 'Product URL': 'https://example.com/fixture', Status: 'Live',
    'FI report ID': report.id, 'Story EN': 'Synthetic test item.',
  };
  const row = headers.map((header) => `"${String(values[header] || '').replaceAll('"', '""')}"`).join(',');
  return importer.parseCsv(`${headers.join(',')}\r\n${row}\r\n`);
}

test('real FI Verify output can publish a synthetic product; sheet score and checkout are ignored', () => {
  const report = publicReport();
  const result = importer.convertRows(sheetRows(report), [report]);
  assert.equal(result.products.length, 1);
  assert.equal(result.makers.length, 1);
  assert.equal(result.products[0].country, 'Fixtureland');
  assert.equal(result.products[0].checkoutReady, false);
  assert.equal(result.products[0].paymentLink, '');
  assert.equal(report.score.value, 100);
  assert.equal(catalog.isPublishableProduct(result.products[0], result.makers[0], report), true);
});

test('maker directory is independent of products; invalid publication gates stay closed', () => {
  const report = publicReport();
  const draftRow = sheetRows(report)[0];
  draftRow.status = 'Draft';
  const result = importer.convertRows([draftRow], [report]);
  assert.equal(result.products.length, 0);
  assert.equal(result.makers.length, 1);
  const published = importer.convertRows(sheetRows(report), [report]);
  const product = published.products[0];
  const publicMaker = published.makers[0];
  assert.equal(catalog.isPublishableProduct({ ...product, photoRights: 'Pending' }, publicMaker, report), false);
  assert.equal(catalog.isPublishableProduct({ ...product, category: 'Windows' }, publicMaker, report), false);
  assert.equal(catalog.isPublishableProduct(product, publicMaker, { ...report, decision: 'inconclusive' }), false);
  assert.equal(catalog.isPublishableProduct(product, publicMaker, { ...report, verificationCurrent: false }), false);
  assert.equal(catalog.safePaymentLink('https://buy.stripe.com.evil.example/a'), null);
});

test('committed maker and report data is empty until a real report is approved', () => {
  for (const name of ['makers', 'reports']) {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'dist', 'data', `${name}.json`), 'utf8'));
    assert.deepEqual(data, []);
  }
});
