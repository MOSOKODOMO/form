import {
  supabase,
  $,
  node,
  session,
  invoke,
  status,
  money,
  safeLink,
} from "./commerce-client.js";
let user, context;
async function load() {
  status("Loading orders…");
  const { data, error } = await supabase
    .from("fi_shop_orders")
    .select(
      "*,fi_shop_order_items(*),fi_shop_payments(*),fi_order_shipments(*)",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const list = $("#orders");
  list.replaceChildren();
  if (!data.length)
    list.append(
      node(
        "p",
        "No orders yet. Browse the catalogue to request an inclusive quote.",
        "empty",
      ),
    );
  for (const order of data) {
    const card = node("article", null, "card");
    card.id = order.id;
    card.append(
      node("span", order.status.replaceAll("_", " "), "badge"),
      node("h2", order.reference),
    );
    for (const item of order.fi_shop_order_items)
      card.append(node("p", `${item.quantity} × ${item.title}`));
    card.append(
      node(
        "p",
        Object.values(order.shipping_address).filter(Boolean).join(", "),
        "muted",
      ),
    );
    if (order.total_minor != null)
      card.append(node("p", `${money(order.total_minor)} AUD total`, "price"));
    else
      card.append(
        node(
          "p",
          "FI is confirming your inclusive quote. No payment is due yet.",
        ),
      );
    if (order.fulfillment_hold)
      card.append(
        node(
          "p",
          "This order is on hold while FI resolves an issue.",
          "notice",
        ),
      );
    const payment = order.fi_shop_payments;
    if (payment) {
      card.append(
        node(
          "p",
          `${payment.livemode ? "Payment" : "Test payment"}: ${payment.status.replaceAll("_", " ")} · ${money(payment.amount_received_minor)}`,
        ),
      );
      if (payment.refunded_minor)
        card.append(node("p", `Refunded: ${money(payment.refunded_minor)}`));
    }
    if (order.status === "awaiting_payment") {
      card.append(
        node(
          "small",
          `Quote valid until ${new Date(order.quote_expires_at).toLocaleString("en-AU")}. Delivery address changes require a new quote.`,
        ),
      );
      const pay = node(
        "button",
        context.checkout_enabled
          ? `Pay ${money(order.total_minor)}${context.payment_mode === "test" ? " ; test mode" : ""}`
          : "Checkout awaiting activation",
      );
      pay.disabled =
        !context.checkout_enabled ||
        order.fulfillment_hold ||
        Date.parse(order.quote_expires_at) <= Date.now();
      pay.onclick = async () => {
        pay.disabled = true;
        try {
          const { url } = await invoke("checkout", { order_id: order.id });
          const destination = new URL(url);
          if (
            destination.protocol !== "https:" ||
            destination.hostname !== "checkout.stripe.com"
          )
            throw new Error("Unexpected checkout destination.");
          location.assign(url);
        } catch (error) {
          status(error.message, true);
          pay.disabled = false;
        }
      };
      const toolbar = node("div", null, "toolbar");
      toolbar.append(pay);
      card.append(toolbar);
    }
    for (const shipment of order.fi_order_shipments) {
      card.append(
        node(
          "p",
          `${shipment.carrier}: ${shipment.tracking_number} · ${shipment.status}`,
        ),
      );
      if (shipment.tracking_url)
        card.append(safeLink(shipment.tracking_url, "Track your delivery"));
    }
    list.append(card);
  }
  status("Order status is up to date.");
}
$("#refresh").onclick = () =>
  load().catch((error) => status(error.message, true));
try {
  const current = await session(true);
  user = current.user;
  context = await invoke("context");
  $("#admin-link").hidden = !context.team;
  await load();
} catch (error) {
  status(error.message, true);
}
