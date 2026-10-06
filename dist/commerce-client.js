import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm";
export const supabase = createClient(
  "https://dszagdjnymxalpwamjyh.supabase.co",
  "sb_publishable_Dm6trfXjIO0C1r9A71PbNw_Q_PF4OM5",
);
export const $ = (selector) => document.querySelector(selector);
export const money = (amount) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(
    amount / 100,
  );
export function node(tag, content, className) {
  const element = document.createElement(tag);
  if (content != null) element.textContent = content;
  if (className) element.className = className;
  return element;
}
export function status(message, error = false) {
  $("#status").textContent = message;
  $("#status").className = `status${error ? " error" : ""}`;
}
export async function read(table, query = "*") {
  const { data, error } = await supabase.from(table).select(query);
  if (error) throw error;
  return data;
}
export async function invoke(action, values = {}) {
  const { data, error } = await supabase.functions.invoke("fi-commerce", {
    body: { action, ...values },
  });
  if (error) {
    let message = error.message;
    try {
      message = (await error.context.json()).error || message;
    } catch {}
    throw new Error(message);
  }
  if (data.error) throw new Error(data.error);
  return data;
}
export async function session(required = false) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session && required) {
    location.assign(`auth.html?next=${location.pathname.split("/").pop()}`);
    throw new Error("Please sign in.");
  }
  return data.session;
}
export function fields(form) {
  return Object.fromEntries(new FormData(form));
}
export function cents(value) {
  const raw = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(raw))
    throw new Error("Enter an amount with at most two decimal places.");
  const [whole, part = ""] = raw.split(".");
  const amount = Number(whole) * 100 + Number(part.padEnd(2, "0"));
  if (!Number.isSafeInteger(amount)) throw new Error("Amount is too large.");
  return amount;
}
export function shipping(values, prefix = "") {
  return Object.fromEntries(
    ["name", "line1", "line2", "city", "state", "postal_code", "country"].map(
      (key) => [key, values[prefix + key] || ""],
    ),
  );
}
export function safeLink(url, label) {
  const a = node("a", label);
  try {
    if (new URL(url).protocol !== "https:") return node("span", label);
  } catch {
    return node("span", label);
  }
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return a;
}
export function busy(form, fn) {
  return async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const buttons = [...form.querySelectorAll("button")];
    buttons.forEach((b) => (b.disabled = true));
    status("Saving…");
    try {
      await fn(event);
      status("Saved.");
    } catch (error) {
      status(error.message, true);
    } finally {
      buttons.forEach((b) => (b.disabled = false));
    }
  };
}
