import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

const sessions = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
]);
const adjustments = new Set([
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.updated",
  "charge.dispute.closed",
]);
function unwrap(result: any): any {
  if (result.error) throw new Error("Database operation failed");
  return result.data;
}

Deno.serve(async (req) => {
  if (req.method !== "POST")
    return new Response("POST required", { status: 405 });
  const key = Deno.env.get("STRIPE_SECRET_KEY") || "";
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const live = Deno.env.get("FI_PAYMENT_MODE") === "live";
  if (!secret || !new RegExp(`^(sk|rk)_${live ? "live" : "test"}_`).test(key))
    return new Response("Webhook not configured", { status: 503 });
  const stripe = new Stripe(key, { maxNetworkRetries: 2, timeout: 20000 });
  const raw = await req.text();
  if (raw.length > 1000000) return new Response("Too large", { status: 413 });
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      raw,
      req.headers.get("stripe-signature") || "",
      secret,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
  if (event.livemode !== live)
    return new Response("Wrong payment environment", { status: 400 });
  if (!sessions.has(event.type) && !adjustments.has(event.type))
    return new Response("Ignored");
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const eventInfo = {
    id: event.id,
    type: event.type,
    livemode: event.livemode,
    created: event.created,
  };
  try {
    if (sessions.has(event.type)) {
      // Read current provider state: late unpaid events cannot undo a successful payment.
      const incoming = event.data.object as Stripe.Checkout.Session;
      const session = await stripe.checkout.sessions.retrieve(incoming.id);
      if (!session.metadata?.fi_order_id)
        return new Response("Unrelated checkout");
      unwrap(
        await client.rpc("fi_commerce_record_payment", {
          p_event: eventInfo,
          p_session: {
            id: session.id,
            metadata: session.metadata,
            client_reference_id: session.client_reference_id,
            amount_total: session.amount_total,
            currency: session.currency,
            livemode: session.livemode,
            payment_status: session.payment_status,
            payment_intent:
              typeof session.payment_intent === "string"
                ? session.payment_intent
                : session.payment_intent?.id,
            customer:
              typeof session.customer === "string"
                ? session.customer
                : session.customer?.id,
            customer_details: session.customer_details,
          },
        }),
      );
    } else {
      const incoming: any = event.data.object;
      const chargeId =
        event.type === "charge.refunded"
          ? incoming.id
          : typeof incoming.charge === "string"
            ? incoming.charge
            : incoming.charge.id;
      const charge = await stripe.charges.retrieve(chargeId);
      const intent =
        typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : charge.payment_intent?.id;
      if (!intent) return new Response("Unrelated payment");
      const payment = await stripe.paymentIntents.retrieve(intent);
      if (!payment.metadata.fi_order_id)
        return new Response("Unrelated payment");
      unwrap(
        await client.rpc("fi_commerce_payment_adjustment", {
          p_event: eventInfo,
          p_intent: intent,
          p_refunded: charge.amount_refunded,
          p_disputed:
            charge.disputed || event.type === "charge.dispute.created",
        }),
      );
    }
    return new Response("OK");
  } catch {
    // Non-2xx means Stripe retries. Never acknowledge an event whose transaction failed.
    console.error("fi_webhook_processing_failed", event.id, event.type);
    return new Response("Retry required", { status: 500 });
  }
});
