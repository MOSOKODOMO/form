import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import {
  InputError,
  text,
  uuid,
  integer,
  object,
  sourceLink,
  httpsUrl,
  address,
  basket,
  costs,
  checkoutPayload,
} from "../_shared/commerce.mjs";

const allowedOrigins = new Set([
  "https://fabricationintelligence.com",
  "https://www.fabricationintelligence.com",
  "https://fabrication-intelligence.vercel.app",
  "http://127.0.0.1:4173",
  "http://localhost:4173",
]);
const db = () =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
function unwrap(result: any): any {
  if (result.error) throw new InputError(result.error.message, 409);
  return result.data;
}
async function rpc(client: any, name: string, args: any) {
  return unwrap(await client.rpc(name, args));
}
async function audit(
  client: any,
  actor: string,
  action: string,
  entity: string,
) {
  unwrap(
    await client
      .from("fi_commerce_audit")
      .insert({ actor_user_id: actor, action, entity_id: entity }),
  );
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Vary: "Origin",
    "Cache-Control": "no-store",
  };
  if (allowedOrigins.has(origin))
    Object.assign(headers, {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers":
        "authorization, apikey, content-type, x-client-info",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    });
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers });
  if (origin && !allowedOrigins.has(origin))
    return reply({ error: "Origin not allowed." }, 403);
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return reply({ error: "POST required." }, 405);
  try {
    const client = db();
    const token = req.headers.get("Authorization")?.replace(/^Bearer /, "");
    if (!token) return reply({ error: "Sign in first." }, 401);
    const auth = await client.auth.getUser(token);
    if (
      auth.error ||
      !auth.data.user ||
      !auth.data.user.email_confirmed_at ||
      auth.data.user.is_anonymous
    )
      return reply({ error: "A verified account is required." }, 401);
    const user = auth.data.user;
    const raw = await req.text();
    if (raw.length > 64000) throw new InputError("Request too large.", 413);
    const input = JSON.parse(raw);
    const action = input.action;
    const team = unwrap(
      await client
        .from("fi_team_members")
        .select("role")
        .eq("email", user.email!.toLowerCase())
        .maybeSingle(),
    );
    const adminActions = [
      "save_product",
      "save_warehouse",
      "save_settings",
      "approve_quote",
      "prepare_purchase",
      "update_purchase",
      "inspect",
      "dispatch",
      "deliver",
      "add_evidence",
      "record_return",
    ];
    if (adminActions.includes(action) && team?.role !== 'admin')
      return reply({ error: "FI team access required." }, 403);

    if (action === "context") {
      const settings = unwrap(
        await client
          .from("fi_commerce_settings")
          .select("pricing_mode")
          .eq("id", true)
          .single(),
      );
      return reply({
        team: team?.role === 'admin',
        checkout_enabled: Deno.env.get("FI_CHECKOUT_ENABLED") === "true",
        payment_mode: Deno.env.get("FI_PAYMENT_MODE") || "test",
        pricing_mode: settings.pricing_mode,
      });
    }
    if (action === "save_settings") {
      if (!["costs_included", "absorb_costs"].includes(input.pricing_mode))
        throw new InputError("Choose a pricing policy.");
      unwrap(
        await client
          .from("fi_commerce_settings")
          .update({
            pricing_mode: input.pricing_mode,
            updated_by: user.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", true),
      );
      await audit(client, user.id, "pricing_policy_saved", user.id);
      return reply({ ok: true });
    }
    if (action === "create_order") {
      if (input.accepted_terms !== true)
        throw new InputError("Accept the order terms first.");
      const id = await rpc(client, "fi_commerce_create_order", {
        p_user: user.id,
        p_request: uuid(input.request_key),
        p_email: user.email,
        p_phone: text(input.phone, "phone", 40),
        p_shipping: address(input.shipping_address),
        p_billing: address(input.billing_address || input.shipping_address),
        p_notes: text(
          input.delivery_notes || "",
          "delivery notes",
          1000,
          false,
        ),
        p_items: basket(input.items),
      });
      return reply({ id });
    }
    if (action === "save_product") {
      const link = sourceLink(input.source_url);
      const id = input.id ? uuid(input.id) : crypto.randomUUID();
      const status = input.status === "published" ? "published" : "draft";
      const price =
        input.source_unit_minor == null
          ? null
          : integer(input.source_unit_minor, "source price", 1);
      const fx = input.fx_to_aud == null ? null : Number(input.fx_to_aud);
      if (fx !== null && (!Number.isFinite(fx) || fx <= 0 || fx > 1000))
        throw new InputError("Check the AUD exchange rate.");
      const currency = input.source_currency || null;
      if (
        currency &&
        !["AUD", "USD", "CNY", "EUR", "GBP", "NZD"].includes(currency)
      )
        throw new InputError("Unsupported source currency.");
      if (currency === "AUD" && fx !== 1)
        throw new InputError(
          "AUD source prices must use an exchange rate of 1.",
        );
      const valid = input.valid_until ? new Date(input.valid_until) : null;
      if (valid && !Number.isFinite(valid.getTime()))
        throw new InputError("Check the supplier quote expiry.");
      if (
        status === "published" &&
        (!price ||
          !fx ||
          !currency ||
          !valid ||
          valid <= new Date() ||
          input.reviewed !== true)
      )
        throw new InputError(
          "Confirm supplier details, price and validity before publishing.",
        );
      if (status === "published" && !input.supplier_variant?.trim())
        throw new InputError(
          "Identify the exact supplier variant before publishing.",
        );
      await rpc(client, "fi_commerce_save_product", {
        p_product: {
          id,
          category_slug: text(input.category_slug, "category", 80),
          title: text(input.title, "title"),
          description: text(
            input.description || "",
            "description",
            5000,
            false,
          ),
          description_zh: text(
            input.description_zh || "",
            "Chinese description",
            5000,
            false,
          ),
          sku: text(input.sku || "", "SKU", 120, false),
          variant_options: object(input.variant_options || {}, "variant"),
          specifications: object(input.specifications || {}, "specifications"),
          image_url: httpsUrl(input.image_url),
          image_permission_confirmed: input.image_permission_confirmed === true,
          status,
          supplier_id: input.supplier_id ? uuid(input.supplier_id) : null,
          supplier_catalogue_item_id: input.supplier_catalogue_item_id ? uuid(input.supplier_catalogue_item_id) : null,
        },
        p_source: {
          ...link,
          supplier_name: text(
            input.supplier_name || "",
            "supplier name",
            200,
            false,
          ),
          supplier_variant: text(
            input.supplier_variant || "",
            "supplier variant",
            300,
            false,
          ),
          source_unit_minor: price,
          source_currency: currency,
          fx_to_aud: fx,
          fx_checked_at: fx ? new Date().toISOString() : null,
          min_quantity: integer(
            input.min_quantity ?? 1,
            "minimum quantity",
            1,
            10000,
          ),
          checked_at: input.reviewed === true ? new Date().toISOString() : null,
          valid_until: valid?.toISOString() || null,
          verification_status:
            input.reviewed === true ? "fi_reviewed" : "unverified",
        },
        p_actor: user.id,
      });
      return reply({ id });
    }
    if (action === "save_warehouse") {
      const id = input.id ? uuid(input.id) : crypto.randomUUID();
      unwrap(
        await client
          .from("fi_warehouses")
          .upsert({
            id,
            name: text(input.name, "warehouse name"),
            contact_name: text(input.contact_name, "contact name", 160),
            phone: text(input.phone, "phone", 40),
            email: text(input.email || "", "email", 320, false),
            address: address(input.address),
            receiving_instructions: text(
              input.receiving_instructions || "",
              "receiving instructions",
              2000,
              false,
            ),
            active: input.active === true,
            updated_by: user.id,
            updated_at: new Date().toISOString(),
          }),
      );
      await audit(client, user.id, "warehouse_saved", id);
      return reply({ id });
    }
    if (action === "approve_quote") {
      const mode = unwrap(
        await client
          .from("fi_commerce_settings")
          .select("pricing_mode")
          .eq("id", true)
          .single(),
      ).pricing_mode;
      if (!["costs_included", "absorb_costs"].includes(mode || ""))
        throw new InputError(
          "The owner must configure the pricing policy before quotes can be approved.",
          409,
        );
      const total = await rpc(client, "fi_commerce_approve_quote", {
        p_order: uuid(input.order_id),
        p_actor: user.id,
        p_costs: costs(input.costs),
        p_mode: mode,
        p_tax_note: text(input.tax_note, "tax treatment", 1000),
        p_scope: text(input.delivery_scope, "delivery scope", 1000),
      });
      return reply({ total_minor: total });
    }
    if (action === "checkout") {
      if (
        Deno.env.get("FI_CHECKOUT_ENABLED") !== "true" ||
        !Deno.env.get("STRIPE_WEBHOOK_SECRET")
      )
        throw new InputError(
          "Checkout is not activated. FI will confirm payment arrangements.",
          503,
        );
      const key = Deno.env.get("STRIPE_SECRET_KEY") || "";
      const live = Deno.env.get("FI_PAYMENT_MODE") === "live";
      if (!new RegExp(`^(sk|rk)_${live ? "live" : "test"}_`).test(key))
        throw new InputError("Payment configuration is incomplete.", 503);
      const order = unwrap(
        await client
          .from("fi_shop_orders")
          .select("*")
          .eq("id", uuid(input.order_id))
          .eq("user_id", user.id)
          .single(),
      );
      const site =
        Deno.env.get("FI_SITE_URL") || "https://fabricationintelligence.com";
      if (!allowedOrigins.has(site))
        throw new InputError("Site URL is not configured.", 503);
      const attempt = await rpc(client, "fi_commerce_reserve_checkout", {
        p_order: order.id,
        p_user: user.id,
        p_live: live,
        p_payload: checkoutPayload(order, site),
      });
      if (
        !["creating", "open"].includes(attempt.status) ||
        Date.parse(attempt.expires_at) <= Date.now()
      )
        throw new InputError(
          "This checkout needs FI reconciliation. No replacement charge was created.",
          409,
        );
      const stripe = new Stripe(key, { maxNetworkRetries: 2, timeout: 20000 });
      if (attempt.stripe_session_id) {
        const existing = await stripe.checkout.sessions.retrieve(
          attempt.stripe_session_id,
        );
        if (existing.status !== "open" || existing.payment_status === "paid")
          throw new InputError(
            "Refresh your order to see its payment status.",
            409,
          );
        return reply({ url: existing.url });
      }
      const session = await stripe.checkout.sessions.create(
        {
          ...attempt.request_payload,
          metadata: {
            ...attempt.request_payload.metadata,
            fi_attempt_key: attempt.idempotency_key,
          },
          expires_at: Math.floor(Date.parse(attempt.expires_at) / 1000),
        },
        { idempotencyKey: `fi-checkout-${attempt.idempotency_key}` },
      );
      unwrap(
        await client
          .from("fi_checkout_attempts")
          .update({
            stripe_session_id: session.id,
            checkout_url: session.url,
            status: "open",
          })
          .eq("order_id", order.id)
          .eq("status", "creating"),
      );
      return reply({ url: session.url });
    }
    if (action === "prepare_purchase") {
      await rpc(client, "fi_commerce_prepare_purchase", {
        p_order: uuid(input.order_id),
        p_warehouse: uuid(input.warehouse_id),
        p_actor: user.id,
      });
      return reply({
        ok: true,
        message:
          "Purchase instructions prepared. Supplier ordering requires manual purchase or a supported adapter.",
      });
    }
    if (action === "update_purchase") {
      await rpc(client, "fi_commerce_update_purchase", {
        p_purchase: uuid(input.purchase_order_id),
        p_actor: user.id,
        p_action: input.transition,
        p_details: {
          external_order_id: text(
            input.external_order_id || "",
            "supplier order reference",
            200,
            false,
          ),
          carrier: text(input.carrier || "", "carrier", 100, false),
          tracking_number: text(
            input.tracking_number || "",
            "tracking number",
            200,
            false,
          ),
          tracking_url: httpsUrl(input.tracking_url),
        },
      });
      return reply({ ok: true });
    }
    if (action === "inspect") {
      if (
        !Array.isArray(input.evidence_paths) ||
        input.evidence_paths.length > 20 ||
        input.evidence_paths.some(
          (p: unknown) => typeof p !== "string" || p.length > 500,
        )
      )
        throw new InputError("Check evidence file paths.");
      await rpc(client, "fi_commerce_inspect", {
        p_purchase: uuid(input.purchase_order_id),
        p_actor: user.id,
        p_checked: integer(
          input.quantity_checked,
          "checked quantity",
          1,
          10000,
        ),
        p_passed: integer(input.quantity_passed, "passed quantity", 0, 10000),
        p_checklist: object(input.checklist, "checklist"),
        p_notes: text(input.notes || "", "notes", 4000, false),
        p_evidence: input.evidence_paths,
      });
      return reply({ ok: true });
    }
    if (action === "dispatch") {
      const id = await rpc(client, "fi_commerce_dispatch", {
        p_order: uuid(input.order_id),
        p_actor: user.id,
        p_carrier: text(input.carrier, "carrier", 100),
        p_tracking: text(input.tracking_number, "tracking number", 200),
        p_url: httpsUrl(input.tracking_url),
      });
      return reply({ id });
    }
    if (action === "deliver") {
      await rpc(client, "fi_commerce_deliver", {
        p_order: uuid(input.order_id),
        p_actor: user.id,
      });
      return reply({ ok: true });
    }
    if (action === "add_evidence") {
      unwrap(
        await client
          .from("fi_product_evidence")
          .insert({
            product_id: uuid(input.product_id),
            field_name: text(input.field_name, "field"),
            claimed_value: text(input.claimed_value, "claim", 2000),
            source_url: httpsUrl(input.source_url),
            excerpt: text(input.excerpt || "", "excerpt", 4000, false),
            evidence_status: input.evidence_status,
            reviewed_by: user.id,
          }),
      );
      return reply({ ok: true });
    }
    if (action === "record_return") {
      await rpc(client, input.order_item_id ? "fi_commerce_record_item_return" : "fi_commerce_record_return", {
        p_order: uuid(input.order_id),
        p_actor: user.id,
        p_reason: text(input.reason, "return reason", 2000),
        ...(input.order_item_id ? {p_item: uuid(input.order_item_id)} : {}),
      });
      return reply({ ok: true });
    }
    throw new InputError("Unknown action.");
  } catch (error) {
    if (error instanceof InputError)
      return reply({ error: error.message }, error.status);
    if (error instanceof SyntaxError)
      return reply({ error: "Invalid JSON." }, 400);
    console.error(
      "commerce_request_failed",
      error instanceof Error ? error.name : "unknown",
    );
    return reply(
      {
        error:
          "The request could not be completed. Please retry or contact FI.",
      },
      500,
    );
  }
});
