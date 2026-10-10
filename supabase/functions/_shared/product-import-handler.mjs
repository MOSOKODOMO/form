import { InputError, sourceLink } from "./commerce.mjs";
import {
  extractProduct,
  importSupplierLink,
  readLimitedText,
} from "./product-import.mjs";

const origins = new Set([
  "https://fabricationintelligence.com",
  "https://www.fabricationintelligence.com",
  "https://fabrication-intelligence.vercel.app",
  "http://127.0.0.1:4173",
  "http://localhost:4173",
]);
/** @param {Request} req @param {{client: any, fetchImpl?: typeof fetch, now?: () => Date}} options */
export async function handleProductImport(
  req,
  { client, fetchImpl = fetch, now = () => new Date() },
) {
  const origin = req.headers.get("origin") || "";
  const headers = {
    "Content-Type": "application/json",
    Vary: "Origin",
    "Cache-Control": "no-store",
  };
  if (origins.has(origin)) {
    Object.assign(headers, {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers":
        "authorization, apikey, content-type, x-client-info",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    });
  }
  const reply = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers });
  if (origin && !origins.has(origin)) {
    return reply({ error: "Origin not allowed." }, 403);
  }
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  if (req.method !== "POST") return reply({ error: "POST required." }, 405);
  try {
    const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)
      ?.[1];
    if (!token) return reply({ error: "Sign in first." }, 401);
    const auth = await client.auth.getUser(token), user = auth.data?.user;
    if (
      auth.error || !user?.id || !user.email || !user.email_confirmed_at ||
      user.is_anonymous
    ) return reply({ error: "A verified account is required." }, 401);
    const membership = await client.from("fi_team_members").select("role").eq(
      "email",
      user.email.toLowerCase(),
    ).maybeSingle();
    if (membership.error) {
      throw new InputError("Team access could not be checked. Try again.", 503);
    }
    if (membership.data?.role !== 'admin') {
      return reply({ error: "FI team access required." }, 403);
    }
    let input;
    try {
      input = JSON.parse(await readLimitedText(req, 160_000));
    } catch (error) {
      if (error instanceof InputError) throw error;
      throw new InputError("Send a valid product link.");
    }
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new InputError("Send a valid product link.");
    }
    const link = sourceLink(input.source_url);
    const pasted = input.pasted_text;
    if (
      pasted !== undefined &&
      (typeof pasted !== "string" || pasted.length > 100_000 ||
        pasted.trim().length < 20)
    ) {
      throw new InputError(
        "Paste between 20 and 100,000 characters of product text.",
      );
    }
    // Existing private audit records provide a shared per-user throttle across workers.
    const recent = await client.from("fi_commerce_audit").select("id", {
      count: "exact",
      head: true,
    }).eq("actor_user_id", user.id).eq("action", "product_link_import").gte(
      "created_at",
      new Date(now().getTime() - 60_000).toISOString(),
    );
    if (recent.error) {
      throw new InputError(
        "The import service is temporarily unavailable.",
        503,
      );
    }
    if (recent.count >= 8) {
      return reply({
        error: "Please wait a minute before importing another link.",
      }, 429);
    }
    const logged = await client.from("fi_commerce_audit").insert({
      actor_user_id: user.id,
      action: "product_link_import",
      entity_id: user.id,
      details: {
        supplier_product_id: link.supplier_product_id,
        method: pasted ? "pasted_text" : "supplier_page",
      },
    });
    if (logged.error) {
      throw new InputError(
        "The import service is temporarily unavailable.",
        503,
      );
    }
    const result = pasted
      ? extractProduct({
        source_url: input.source_url,
        pasted_text: pasted.trim(),
        fetched_at: now().toISOString(),
      })
      : await importSupplierLink(input.source_url, {
        fetchImpl,
        now: () => now().toISOString(),
      });
    return reply(result);
  } catch (error) {
    return reply({
      error: error instanceof InputError
        ? error.message
        : "The product could not be imported. Try again or paste the page text.",
    }, error instanceof InputError ? error.status : 500);
  }
}
