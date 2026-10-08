import { InputError, sourceLink } from "./commerce.mjs";

export const IMPORT_AGENT = "FabricationIntelligenceImporter/1.0";
const MAX_PAGE_BYTES = 2_000_000;
const list = (value) => Array.isArray(value) ? value : [];
const record = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
const blockedKeys = new Set(["__proto__", "constructor", "prototype"]);
function decode(value) {
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi,
    (match, key) => {
      if (key[0] !== "#") {
        return ({
          amp: "&",
          quot: '"',
          apos: "'",
          lt: "<",
          gt: ">",
          nbsp: " ",
        })[key.toLowerCase()] || match;
      }
      const point = key[1].toLowerCase() === "x"
        ? parseInt(key.slice(2), 16)
        : Number(key.slice(1));
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : "";
    },
  );
}
const clean = (value, max = 300) =>
  typeof value === "string"
    ? decode(value.replace(/<[^>]*>/g, " ")).replace(
      /[\u0000-\u001f\u007f]/g,
      " ",
    ).replace(/\s+/g, " ").trim().slice(0, max)
    : "";
function attributes(tag) {
  const result = Object.create(null);
  for (
    const match of tag.matchAll(
      /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g,
    )
  ) result[match[1].toLowerCase()] = decode(match[2] ?? match[3] ?? match[4]);
  return result;
}
function pageText(html) {
  return decode(
    html.replace(
      /<(script|style|noscript|svg|template|iframe|head)\b[^>]*>[\s\S]*?<\/\1>/gi,
      "\n",
    )
      .replace(/<\/(?:div|p|td|th|tr|dt|dd|li|h[1-6])>|<br\s*\/?>/gi, "\n")
      .replace(/<[^>]*>/g, " "),
  )
    .split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean)
    .join("\n");
}
// Read JSON literals only. Supplier JavaScript is never executed.
function detailData(html) {
  const marker = /window\.detailData\s*=\s*/g.exec(html);
  if (!marker) return {};
  const start = marker.index + marker[0].length;
  if (html[start] !== "{") return {};
  let depth = 0, quoted = false, escaped = false;
  for (let i = start; i < html.length; i++) {
    const char = html[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) {
      try {
        return record(JSON.parse(html.slice(start, i + 1)));
      } catch {
        return {};
      }
    }
  }
  return {};
}
function structuredProducts(html) {
  const products = [];
  const visit = (value, depth = 0) => {
    if (depth > 6) return;
    if (Array.isArray(value)) {
      value.slice(0, 100).forEach((item) => visit(item, depth + 1));
      return;
    }
    if (!value || typeof value !== "object") return;
    if (
      value["@type"] === "Product" || list(value["@type"]).includes("Product")
    ) products.push(value);
    if (value["@graph"]) visit(value["@graph"], depth + 1);
    if (value.mainEntity) visit(value.mainEntity, depth + 1);
  };
  for (
    const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)
  ) {
    if (
      attributes(match[1]).type?.toLowerCase() !== "application/ld+json"
    ) continue;
    try {
      visit(JSON.parse(match[2]));
    } catch { /* Malformed metadata is not executable data. */ }
  }
  return products;
}
function productId(value) {
  const raw = String(value ?? "");
  return /^\d{8,20}$/.test(raw)
    ? raw
    : raw.match(/[_/-](\d{8,20})(?:\.html|$)/)?.[1];
}
export function safeSupplierImage(value) {
  try {
    const url = new URL(
      typeof value === "string" && value.startsWith("//")
        ? `https:${value}`
        : value,
    );
    if (
      url.protocol !== "https:" || url.port || url.username || url.password ||
      !/(^|\.)alicdn\.com$/.test(url.hostname) ||
      !/\.(?:jpe?g|png|webp)(?:_|$)/i.test(url.pathname)
    ) return null;
    return url.href.length <= 4000 ? url.href : null;
  } catch {
    return null;
  }
}
function category(title, specs) {
  const text = `${title} ${specs.Type || ""}`;
  for (
    const [slug, re] of [
      ["door-hardware", /\b(handle|lever|knob|hinge|lock|pull)s?\b/i],
      ["windows", /\bwindows?\b/i],
      ["stairs", /\b(stair|staircase)s?\b/i],
      ["glass", /\b(glass|glazing)\b/i],
      ["doors", /\bdoors?\b/i],
    ]
  ) if (re.test(text)) return slug;
  return "other";
}
const pastedLabels =
  /^(?:product(?: name| title)?|title|supplier|company name|manufacturer|material|finish|color|colour|size|dimensions?|model(?: number)?|brand(?: name)?|place of origin|origin|usage|application|design style|warranty|center distance|fitting door thickness|moq|minimum order(?: quantity)?|lead time)$/i;
function textPairs(text) {
  const lines = text.split("\n").map((x) => x.trim()).filter(Boolean),
    pairs = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^([^:：]{1,50})[:：]\s*(.+)$/);
    if (match && pastedLabels.test(match[1])) pairs.push([match[1], match[2]]);
    else if (
      pastedLabels.test(lines[i]) && lines[i + 1] &&
      !pastedLabels.test(lines[i + 1])
    ) pairs.push([lines[i], lines[++i]]);
  }
  return pairs;
}

export function extractProduct(
  {
    source_url,
    html = "",
    pasted_text = "",
    fetched_at = new Date().toISOString(),
  },
) {
  const link = sourceLink(source_url), fromText = !!pasted_text;
  const visible = fromText ? pasted_text : pageText(html);
  const data = detailData(html),
    global = record(data.globalData),
    product = record(global.product);
  if (
    product.productId && String(product.productId) !== link.supplier_product_id
  ) {
    throw new InputError(
      "The supplier returned a different product. Check the link.",
      422,
    );
  }
  const candidates = structuredProducts(html);
  const matched = candidates.find((p) =>
    [p["@id"], p.productID, p.sku, p.url].some((v) =>
      productId(v) === link.supplier_product_id
    )
  );
  const only = candidates.length === 1 ? candidates[0] : null;
  const statedId = only &&
    [only["@id"], only.productID, only.sku, only.url].map(productId).find(
      Boolean,
    );
  if (!matched && statedId && statedId !== link.supplier_product_id) {
    throw new InputError(
      "The page metadata identifies a different product. Check the link.",
      422,
    );
  }
  const ld = matched || (only && !statedId ? only : {}) || {};
  const meta = Object.create(null);
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attributes(tag[0]);
    if (a.property || a.name) meta[a.property || a.name] = a.content;
  }
  const pairs = textPairs(visible), specs = Object.create(null), warnings = [];
  const add = (key, value) => {
    key = clean(key, 60);
    value = clean(typeof value === "number" ? String(value) : value, 300);
    if (
      !key || !value || blockedKeys.has(key) || Object.keys(specs).length >= 40
    ) return;
    if (/lead time/i.test(key) && !/\d/.test(value)) return;
    if (specs[key] && specs[key] !== value) {
      warnings.push(
        `The listing gives different values for ${key}; check the selected variant.`,
      );
      return;
    }
    specs[key] = value;
  };
  for (
    const attr of [
      ...list(product.productKeyIndustryProperties),
      ...list(product.productOtherProperties),
      ...list(product.productBasicProperties),
    ]
  ) add(attr.attrName, attr.attrValue);
  const nodes = record(data.nodeMap);
  for (
    const group of list(
      nodes.module_sorted_attribute?.privateData?.productSortedProperties,
    )
  ) {
    for (const attr of list(group.attributeList)) {
      add(attr.attribute, attr.value);
    }
  }
  for (const attr of list(ld.additionalProperty)) add(attr.name, attr.value);
  for (const key of ["material", "color", "size", "model"]) {
    if (ld[key]) add(key[0].toUpperCase() + key.slice(1), ld[key]);
  }
  for (const [key, value] of pairs) {
    if (
      !/^(?:title|product|supplier|company|manufacturer|moq|minimum order)/i
        .test(key)
    ) add(key, value);
  }
  const pair = (pattern) => pairs.find(([key]) => pattern.test(key))?.[1] || "";
  const title = clean(
    product.subject || ld.name || meta["og:title"] ||
      pair(/^(product(?: name| title)?|title)$/i) ||
      html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ||
      html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1],
    500,
  ).replace(/\s*[-|]\s*Buy\b.*Alibaba\.com.*$/i, "").replace(
    /\s*[-|]\s*Alibaba\.com.*$/i,
    "",
  ).slice(0, 200);
  if (
    !title ||
    /captcha|access denied|security verification|log in|sign in/i.test(title) ||
    (!product.subject && !ld.name &&
      /verify you are human|slide to verify|unusual traffic|are you a robot/i
        .test(visible.slice(0, 3000)))
  ) {
    throw new InputError(
      "Alibaba did not provide readable product details. Open the listing, then use Paste page text below.",
      422,
    );
  }
  const offers = list(ld.offers).length ? ld.offers : [record(ld.offers)];
  const supplier = clean(
    global.seller?.companyName || ld.seller?.name || offers[0]?.seller?.name ||
      pair(/^(supplier|company name|manufacturer)$/i),
    200,
  );
  const options = Object.create(null);
  for (const axis of list(product.sku?.skuAttrs).slice(0, 6)) {
    const key = clean(axis.name, 60),
      values = [
        ...new Set(
          list(axis.values).map((v) => clean(v.name, 80)).filter(Boolean),
        ),
      ];
    if (key && !blockedKeys.has(key) && values.length) {
      options[key] = values.slice(0, 20);
    }
    if (values.length > 20) {
      warnings.push(
        `Only the first 20 ${key} choices are shown. Review the full supplier listing.`,
      );
    }
  }
  const images = [
    ...new Set(
      [
        ...list(product.mediaItems).filter((m) => m.type === "image").map((m) =>
          m.imageUrl?.big
        ),
        ...(typeof ld.image === "string"
          ? [ld.image]
          : list(ld.image).map((x) => typeof x === "string" ? x : x?.url)),
        meta["og:image"],
      ].map(safeSupplierImage).filter(Boolean),
    ),
  ].slice(0, 12);
  const priceHints = [];
  const range = product.price?.productRangePrices;
  const numeric = (value) =>
    /^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/.test(String(value ?? "")) &&
      Number(value) > 0
      ? Number(value)
      : null;
  if (
    numeric(range?.dollarPriceRangeLow) && numeric(range?.dollarPriceRangeHigh)
  ) {
    priceHints.push({
      currency: "USD",
      low: Number(range.dollarPriceRangeLow),
      high: Number(range.dollarPriceRangeHigh),
      basis: "Supplier listing range",
    });
  }
  for (const offer of offers.slice(0, 4)) {
    if (!/^[A-Z]{3}$/.test(offer.priceCurrency || "")) continue;
    const low = numeric(offer.lowPrice ?? offer.price),
      high = numeric(offer.highPrice ?? offer.price);
    if (
      low && high && high >= low &&
      !priceHints.some((p) =>
        p.currency === offer.priceCurrency && p.low === low && p.high === high
      )
    ) {
      priceHints.push({
        currency: offer.priceCurrency,
        low,
        high,
        basis: "Supplier structured metadata",
      });
    }
  }
  const hasVariants = Object.values(options).some((values) =>
    values.length > 1
  );
  const unambiguous = priceHints.length === 1 &&
    priceHints[0].low === priceHints[0].high && !hasVariants &&
    offers.length === 1 && offers[0]["@type"] !== "AggregateOffer";
  const currencies = [...new Set(priceHints.map((p) => p.currency))];
  const moqValue = product.moq ??
    pair(/^(moq|minimum order(?: quantity)?)$/i).match(/^\s*(\d+)\b/)?.[1];
  const moq = Number(moqValue);
  const validMoq = Number.isInteger(moq) && moq > 0 && moq <= 10000;
  const details = Object.entries(specs).filter(([key]) =>
    /^(material|finish|size|dimensions?|model(?: number)?|fitting door thickness|center distance|design style|usage)$/i
      .test(key)
  ).slice(0, 8);
  const description = `${title}.${
    details.length
      ? "\n\n" + details.map(([key, value]) => `${key}: ${value}.`).join("\n")
      : ""
  }`.slice(0, 5000);
  const references = [{
    label: fromText
      ? "Supplier listing (text supplied by you)"
      : "Supplier listing",
    url: link.canonical_url,
    status: "supplier_stated",
  }];
  try {
    const url = new URL(global.seller?.companyProfileUrl);
    if (
      url.protocol === "https:" &&
      /^[a-z0-9-]+\.en\.alibaba\.com$/.test(url.hostname) &&
      url.pathname === "/company_profile.html" && !url.username &&
      !url.password && !url.port
    ) {
      references.push({
        label: "Supplier company profile",
        url: url.href,
        status: "supplier_stated",
      });
    }
  } catch { /* Optional reference absent. */ }
  warnings.unshift(
    "Supplier claims are not independently verified. Check specifications and permission to use the photos.",
  );
  if (!unambiguous) {
    warnings.push(
      "Confirm the exact variant and its current unit price. Listing ranges are not a payable quote.",
    );
  }
  if (!validMoq) {
    warnings.push(
      "Minimum order quantity was not confirmed; check the quantity before saving.",
    );
  }
  if (fromText) {
    warnings.push(
      "Extracted from the text you supplied; the live page was not fetched.",
    );
  }
  return {
    version: 1,
    source_url: link.original_url,
    canonical_url: link.canonical_url,
    supplier_product_id: link.supplier_product_id,
    fetched_at,
    method: fromText ? "pasted_text" : "supplier_page",
    fields: {
      source_url: link.original_url,
      title,
      supplier_name: supplier,
      category_slug: category(title, specs),
      description,
      description_zh: "",
      sku: clean(specs["Model Number"] || ld.model, 120),
      supplier_variant: "",
      min_quantity: validMoq ? moq : "",
      source_price: unambiguous ? priceHints[0].low.toFixed(2) : "",
      source_currency: currencies.length === 1 ? currencies[0] : "",
      fx_to_aud: "",
      valid_until: "",
      variant_options: JSON.stringify(options, null, 2),
      specifications: JSON.stringify(specs, null, 2),
      image_url: images[0] || "",
      status: "draft",
      reviewed: false,
      image_permission_confirmed: false,
    },
    image_urls: images,
    price_hints: priceHints,
    references,
    warnings: [...new Set(warnings)].slice(0, 12),
  };
}

export async function readLimitedText(response, maxBytes) {
  if (Number(response.headers.get("content-length")) > maxBytes) {
    await response.body?.cancel();
    throw new InputError(
      "The page is too large to import. Use Paste page text instead.",
      413,
    );
  }
  if (!response.body) return "";
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let size = 0, text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        throw new InputError(
          "The page is too large to import. Use Paste page text instead.",
          413,
        );
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export function robotsAllow(robots, pathname) {
  const groups = [];
  let group = null, hasRules = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.split("#")[0].trim(),
      match = line.match(/^([^:]+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1].toLowerCase().trim(), value = match[2].trim();
    if (key === "user-agent") {
      if (!group || hasRules) {
        group = { agents: [], rules: [] };
        groups.push(group);
        hasRules = false;
      }
      group.agents.push(value.toLowerCase());
    } else if (group && ["allow", "disallow"].includes(key)) {
      hasRules = true;
      if (value) group.rules.push({ allow: key === "allow", path: value });
    }
  }
  const named = groups.filter((g) =>
    g.agents.some((a) => a !== "*" && IMPORT_AGENT.toLowerCase().includes(a))
  );
  const applicable = named.length
    ? named
    : groups.filter((g) => g.agents.includes("*"));
  const matches = applicable.flatMap((g) => g.rules).filter((rule) => {
    const expression = rule.path.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(
      /\*/g,
      ".*",
    ).replace(/\\\$$/, "$");
    return new RegExp(`^${expression}`).test(pathname);
  }).sort((a, b) =>
    b.path.length - a.path.length || Number(b.allow) - Number(a.allow)
  );
  return !matches.length || matches[0].allow;
}
export async function importSupplierLink(
  source_url,
  { fetchImpl = fetch, now = () => new Date().toISOString() } = {},
) {
  const link = sourceLink(source_url), signal = AbortSignal.timeout(20_000);
  const request = async (url) =>
    fetchImpl(url, {
      redirect: "manual",
      signal,
      headers: {
        "User-Agent": IMPORT_AGENT,
        "Accept": "text/html,text/plain",
        "Accept-Language": "en-AU,en;q=0.9",
      },
    });
  try {
    const robots = await request("https://www.alibaba.com/robots.txt");
    if (robots.status === 200) {
      if (
        !robotsAllow(
          await readLimitedText(robots, 100_000),
          new URL(link.canonical_url).pathname,
        )
      ) {
        throw new InputError(
          "The supplier does not allow this page to be imported automatically. Use Paste page text.",
          422,
        );
      }
    } else if (robots.status !== 404 && robots.status !== 410) {
      await robots.body?.cancel();
      throw new InputError(
        "Alibaba did not allow the import check. Open the listing and use Paste page text.",
        422,
      );
    } else await robots.body?.cancel();
    let url = link.canonical_url;
    for (let hop = 0; hop < 3; hop++) {
      const response = await request(url);
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location) break;
        let next;
        try {
          next = sourceLink(new URL(location, url).href);
        } catch {
          throw new InputError(
            "Alibaba redirected to a sign-in, verification or unsupported page. Use Paste page text.",
            422,
          );
        }
        if (next.supplier_product_id !== link.supplier_product_id) {
          throw new InputError(
            "Alibaba redirected to a different product. Check the link.",
            422,
          );
        }
        url = next.canonical_url;
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new InputError(
          "Alibaba could not provide the listing. Open it in your browser and use Paste page text.",
          422,
        );
      }
      if (
        !/text\/html|application\/xhtml\+xml/i.test(
          response.headers.get("content-type") || "",
        )
      ) {
        await response.body?.cancel();
        throw new InputError(
          "The supplier did not return a product page.",
          422,
        );
      }
      return extractProduct({
        source_url,
        html: await readLimitedText(response, MAX_PAGE_BYTES),
        fetched_at: now(),
      });
    }
    throw new InputError(
      "The supplier redirected too many times. Use Paste page text.",
      422,
    );
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError(
      "The supplier could not be reached in time. Try again or use Paste page text.",
      502,
    );
  }
}
