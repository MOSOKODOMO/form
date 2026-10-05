'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { isApprovedReport, isCurrentVerifiedReport, isPublishableProduct, safeExternalUrl, safePhotoUrl } = require('../dist/catalog.js');

const root = path.resolve(__dirname, '..');
const defaultDataDir = path.join(root, 'dist', 'data');
// The shop's dist/data/products.json is written by tools/approve.py. Imports go to data/product-sheet/ (never published) for a person to review.
const defaultOutDir = path.join(root, 'data', 'product-sheet');
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const canonical = (key) => String(key ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const text = (value) => String(value ?? '').trim();

function parseCsv(input) {
  const content = String(input).replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    if (quoted) {
      if (char === '"' && content[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field === '') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && content[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.some((part) => text(part))) rows.push(row);
      row = [];
    } else field += char;
  }
  if (quoted) throw new Error('CSV has an unclosed quoted field.');
  row.push(field);
  if (row.some((part) => text(part))) rows.push(row);
  if (rows.length === 0) throw new Error('The Product Sheet export is empty.');
  const headers = rows.shift().map(canonical);
  if (headers.some((header) => !header)) throw new Error('CSV has a blank header.');
  if (new Set(headers).size !== headers.length) throw new Error('CSV has duplicate headers after normalisation.');
  return rows.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])));
}

function parseSheet(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  if (path.extname(filePath).toLowerCase() === '.csv') return parseCsv(content);
  if (path.extname(filePath).toLowerCase() === '.json') {
    const parsed = JSON.parse(content);
    const rows = Array.isArray(parsed) ? parsed : parsed.rows;
    if (!Array.isArray(rows)) throw new Error('JSON Product Sheet must be an array or an object with a rows array.');
    return rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [canonical(key), value])));
  }
  throw new Error('Product Sheet must be .csv or .json.');
}

function field(row, ...names) {
  for (const name of names) {
    const found = row[canonical(name)];
    if (found !== undefined && found !== null && text(found) !== '') return text(found);
  }
  return '';
}

function list(value) {
  return text(value).split(/[;|]/).map(text).filter(Boolean);
}

function slug(value) {
  return text(value).normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 45) || 'item';
}

function stableId(label, identity) {
  return `${slug(label)}-${crypto.createHash('sha256').update(identity.toLowerCase()).digest('hex').slice(0, 8)}`;
}

function normalizeStatus(raw) {
  const status = text(raw).toLowerCase();
  return status === 'approved' ? 'Approved' : status === 'live' ? 'Live' : status;
}

function normalizePermission(raw) {
  const permission = text(raw).toLowerCase();
  return ['approved', 'yes', 'granted', 'permission granted'].includes(permission) ? 'Approved' : 'Pending';
}

function convertRows(rows, reports) {
  const products = [];
  const makers = new Map();
  const skipped = [];
  const reportById = new Map(reports.map((report) => [report.id, report]));
  const seen = new Set();

  // A verified maker can appear in the directory before any product is ready.
  reports.forEach((report) => {
    const name = text(report?.maker?.name);
    const website = safeExternalUrl(report?.maker?.website);
    if (!name || !website) return;
    const id = stableId(name, `${name}|${new URL(website).hostname.replace(/^www\./, '')}`);
    const maker = { id, name, website, country: '', reportIds: [] };
    if (!isCurrentVerifiedReport(report, maker)) return;
    if (!makers.has(id)) makers.set(id, maker);
    makers.get(id).reportIds.push(report.id);
  });

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const status = normalizeStatus(field(row, 'Status'));
    if (!['Approved', 'Live'].includes(status)) {
      skipped.push({ row: rowNumber, reason: 'Status is not Approved or Live' });
      return;
    }
    const name = field(row, 'Product', 'Product name');
    const makerName = field(row, 'Maker', 'Maker name');
    const makerWebsite = safeExternalUrl(field(row, 'Maker URL', 'Maker website'));
    const productUrlText = field(row, 'Product URL', 'Product link');
    const productUrl = productUrlText ? safeExternalUrl(productUrlText) : '';
    const photoUrl = safePhotoUrl(field(row, 'Photo URL', 'Photo'));
    const photoRights = normalizePermission(field(row, 'Photo permission', 'Photo rights'));
    const reportId = field(row, 'FI report ID', 'Report ID');
    if (!name || !makerName || !makerWebsite || !photoUrl || photoRights !== 'Approved' || !uuidPattern.test(reportId) || (productUrlText && !productUrl)) {
      skipped.push({ row: rowNumber, reason: 'Missing or invalid name, maker URL, photo URL, photo permission, product URL, or FI report ID' });
      return;
    }

    const makerId = stableId(makerName, `${makerName}|${new URL(makerWebsite).hostname.replace(/^www\./, '')}`);
    const maker = makers.get(makerId) || { id: makerId, name: makerName, website: makerWebsite, country: field(row, 'Country'), reportIds: [] };
    const report = reportById.get(reportId);
    if (!isApprovedReport(report, maker)) {
      skipped.push({ row: rowNumber, reason: 'FI Verify report is absent, unapproved, or belongs to another maker' });
      return;
    }
    const id = stableId(name, `${name}|${makerId}|${productUrl || field(row, 'Category')}`);
    if (seen.has(id)) throw new Error(`Duplicate publishable product in row ${rowNumber}: ${name}`);
    seen.add(id);
    const product = {
      id,
      name,
      makerId,
      reportId,
      productUrl,
      category: field(row, 'Category'),
      material: field(row, 'Material'),
      finishes: list(field(row, 'Finishes')),
      sizes: list(field(row, 'Sizes')),
      usdPrice: field(row, 'Price USD', 'USD price'),
      moq: field(row, 'MOQ'),
      photoUrl,
      storyEn: field(row, 'Story EN', 'EN story'),
      storyZh: field(row, 'Story CN', 'ZH story'),
      country: field(row, 'Country'),
      deliveryTime: field(row, 'Confirmed delivery time'),
      deliveryTimeConfirmed: false,
      paymentLink: '',
      checkoutReady: false,
      origin: {
        town: field(row, 'Origin town'),
        craft: field(row, 'Origin craft'),
        materials: field(row, 'Origin materials'),
        distanceToMelbourneKm: field(row, 'Distance to Melbourne km') || null,
      },
      status,
      photoRights,
    };
    if (!isPublishableProduct(product, maker, report)) {
      skipped.push({ row: rowNumber, reason: 'Publication checks did not pass' });
      return;
    }
    products.push(product);
    const existing = makers.get(makerId);
    if (existing) {
      if (!existing.reportIds.includes(reportId)) existing.reportIds.push(reportId);
      if (!existing.country) existing.country = field(row, 'Country');
    } else {
      maker.reportIds.push(reportId);
      makers.set(makerId, maker);
    }
  });

  products.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return { products, makers: [...makers.values()].sort((a, b) => a.name.localeCompare(b.name)), skipped };
}

function readReports(filePath) {
  const reports = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!Array.isArray(reports)) throw new Error('Public FI Verify reports JSON must be an array.');
  for (const report of reports) {
    if (!isApprovedReport(report, report?.maker)) throw new Error(`Public reports JSON includes an unpublished or invalid report: ${report?.id || 'no id'}`);
  }
  return reports;
}

function options(args) {
  const parsed = { input: '', reports: path.join(defaultDataDir, 'reports.json'), outDir: defaultOutDir, check: false };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--check') parsed.check = true;
    else if (arg === '--reports') parsed.reports = path.resolve(args[++i] || '');
    else if (arg === '--out-dir') parsed.outDir = path.resolve(args[++i] || '');
    else if (!arg.startsWith('--') && !parsed.input) parsed.input = path.resolve(arg);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!parsed.input) throw new Error('Usage: node scripts/import-product-sheet.cjs <sheet.csv|sheet.json> [--reports path] [--out-dir path] [--check]');
  return parsed;
}

function run(args) {
  const config = options(args);
  const result = convertRows(parseSheet(config.input), readReports(config.reports));
  if (!config.check) {
    fs.mkdirSync(config.outDir, { recursive: true });
    fs.writeFileSync(path.join(config.outDir, 'products.json'), `${JSON.stringify(result.products, null, 2)}\n`);
    fs.writeFileSync(path.join(config.outDir, 'makers.json'), `${JSON.stringify(result.makers, null, 2)}\n`);
  }
  process.stdout.write(`${JSON.stringify({ publishedProducts: result.products.length, publishedMakers: result.makers.length, skipped: result.skipped, dryRun: config.check }, null, 2)}\n`);
}

if (require.main === module) {
  try { run(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { parseCsv, parseSheet, convertRows, normalizePermission, normalizeStatus, run };
