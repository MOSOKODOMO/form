export const COST_FIELDS = [
  "inbound_shipping_minor",
  "inspection_minor",
  "outbound_shipping_minor",
  "duties_minor",
  "tax_minor",
  "payment_cost_minor",
];
export class InputError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export function text(value, name, max = 200, required = true) {
  if (
    typeof value !== "string" ||
    value.trim().length > max ||
    (required && !value.trim())
  )
    throw new InputError(`Check ${name}.`);
  return value.trim();
}
export function uuid(value) {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new InputError("Invalid record ID.");
  return value;
}
export function integer(value, name, min = 0, max = 100000000) {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new InputError(`Check ${name}.`);
  return value;
}
export function object(value, name) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    JSON.stringify(value).length > 20000
  )
    throw new InputError(`Check ${name}.`);
  return value;
}
export function sourceLink(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new InputError("Enter a valid Alibaba product link.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !["www.alibaba.com", "alibaba.com"].includes(url.hostname)
  )
    throw new InputError(
      "This importer currently accepts HTTPS Alibaba product links.",
    );
  const match = url.pathname.match(
    /^\/product-detail\/[A-Za-z0-9_-]+_(\d+)\.html$/,
  );
  if (!match) throw new InputError("Use the full Alibaba product-detail link.");
  return {
    original_url: text(value, "source link", 4000),
    canonical_url: `https://www.alibaba.com${url.pathname}`,
    platform: "alibaba",
    supplier_product_id: match[1],
  };
}
export function httpsUrl(value) {
  if (!value) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new InputError("Enter an HTTPS URL.");
  }
  if (url.protocol !== "https:" || url.username || url.password)
    throw new InputError("Enter an HTTPS URL.");
  return text(url.href, "URL", 4000);
}
export function address(value) {
  object(value, "address");
  const result = {};
  for (const [key, max, required] of [
    ["name", 160, true],
    ["line1", 200, true],
    ["line2", 200, false],
    ["city", 120, true],
    ["state", 100, true],
    ["postal_code", 20, true],
    ["country", 2, true],
  ])
    result[key] = text(value[key] ?? "", key, max, required);
  if (!/^[A-Z]{2}$/.test(result.country))
    throw new InputError("Use a two-letter country code.");
  return result;
}
export function basket(value) {
  if (!Array.isArray(value) || !value.length || value.length > 30)
    throw new InputError("Choose 1–30 products.");
  const rows = value.map((item) => ({
    product_id: uuid(item.product_id),
    quantity: integer(item.quantity, "quantity", 1, 10000),
  }));
  if (new Set(rows.map((x) => x.product_id)).size !== rows.length)
    throw new InputError("Combine duplicate product quantities.");
  return rows;
}
export function costs(value) {
  object(value, "costs");
  return Object.fromEntries(
    COST_FIELDS.map((key) => [key, integer(value[key], key)]),
  );
}
export function calculatePrice(sourceMinor, fx, quantity, extras, mode) {
  integer(sourceMinor, "source price", 1);
  integer(quantity, "quantity", 1, 10000);
  if (!Number.isFinite(fx) || fx <= 0 || fx > 1000)
    throw new InputError("Check the exchange rate.");
  costs(extras);
  const source = Math.round(sourceMinor * fx) * quantity;
  const markup = Math.round(source * 0.1);
  const additional = Object.values(extras).reduce((a, b) => a + b, 0);
  if (!["costs_included", "absorb_costs"].includes(mode))
    throw new InputError("Choose a pricing policy.");
  return {
    source,
    markup,
    total: source + markup + (mode === "costs_included" ? additional : 0),
    contribution: markup - (mode === "absorb_costs" ? additional : 0),
  };
}
export function checkoutPayload(order, siteUrl) {
  return {
    mode: "payment",
    client_reference_id: order.id,
    integration_identifier: "fi-warehouse-qmzrptla",
    customer_email: order.customer_email,
    customer_creation: "always",
    billing_address_collection: "required",
    metadata: { fi_order_id: order.id, fi_user_id: order.user_id },
    payment_intent_data: { metadata: { fi_order_id: order.id } },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "aud",
          unit_amount: integer(order.total_minor, "approved total", 1),
          product_data: {
            name: `${order.reference} — inclusive order total`,
            description:
              "Products, agreed freight, warehouse inspection and applicable quoted tax. Delivery to the address confirmed with FI.",
          },
        },
      },
    ],
    success_url: `${siteUrl}/orders.html?order=${order.id}`,
    cancel_url: `${siteUrl}/orders.html?order=${order.id}`,
    // Delivery address is locked with the inclusive quote. Checkout collects billing only.
    adaptive_pricing: { enabled: false },
  };
}
export function assertCheckoutMatch(attempt, session, live) {
  if (
    session.id !== attempt.stripe_session_id ||
    session.amount_total !== attempt.amount_minor ||
    session.currency !== "aud" ||
    session.livemode !== live ||
    session.livemode !== attempt.livemode ||
    session.client_reference_id !== attempt.order_id ||
    session.metadata?.fi_order_id !== attempt.order_id
  )
    throw new InputError("Payment verification mismatch.", 409);
}
