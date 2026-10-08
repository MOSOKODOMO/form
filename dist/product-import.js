const fieldNames = [
  "source_url",
  "title",
  "supplier_name",
  "category_slug",
  "description",
  "description_zh",
  "sku",
  "supplier_variant",
  "min_quantity",
  "source_price",
  "source_currency",
  "fx_to_aud",
  "valid_until",
  "variant_options",
  "specifications",
  "image_url",
];
export function importedFields(draft) {
  if (
    !draft || draft.version !== 1 || !draft.fields || !draft.fields.title ||
    !draft.fields.source_url
  ) {
    throw new Error(
      "The importer returned an incomplete draft. Try pasting the page text.",
    );
  }
  return {
    ...Object.fromEntries(
      fieldNames.map((key) => [key, draft.fields[key] ?? ""]),
    ),
    status: "draft",
    reviewed: false,
    image_permission_confirmed: false,
  };
}
function imageUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password &&
        !url.port && /(^|\.)alicdn\.com$/.test(url.hostname)
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function setupProductImport(
  { root = document, request, apply, chooseImage, findExisting = () => null },
) {
  const form = root.querySelector("#link-import-form"),
    output = root.querySelector("#link-import-result"),
    message = root.querySelector("#link-import-status"),
    fallback = root.querySelector("#link-import-fallback");
  let sequence = 0, current = null, applied = false;
  const el = (tag, text, className) => {
    const node = root.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const setMessage = (text, error = false) => {
    message.textContent = text;
    message.className = `status${error ? " error" : ""}`;
  };
  const setBusy = (value) => {
    form.querySelectorAll("input,textarea,button").forEach((control) =>
      control.disabled = value
    );
    form.setAttribute("aria-busy", String(value));
  };
  function clear() {
    sequence++;
    current = null;
    applied = false;
    output.replaceChildren();
    output.hidden = true;
    setMessage("");
    setBusy(false);
  }
  function show(draft) {
    importedFields(draft);
    current = draft;
    applied = false;
    output.replaceChildren();
    output.hidden = false;
    output.append(
      el("span", "Private draft · review required", "badge"),
      el("h3", draft.fields.title),
      el("p", draft.fields.supplier_name || "Supplier name needs confirmation"),
    );
    const copy = el("p", draft.fields.description, "import-description");
    output.append(copy);
    if (draft.price_hints?.length) {
      const prices = el("div", null, "notice");
      prices.append(el("strong", "Supplier price references"));
      for (const price of draft.price_hints.slice(0, 4)) {
        prices.append(
          el(
            "p",
            `${price.currency} ${Number(price.low).toFixed(2)}${
              price.high !== price.low
                ? `–${Number(price.high).toFixed(2)}`
                : ""
            } · ${price.basis}`,
          ),
        );
      }
      prices.append(
        el(
          "small",
          "Confirm the exact variant, currency, quantity and current price before publishing.",
        ),
      );
      output.append(prices);
    }
    const warnings = el("ul", null, "import-warnings");
    for (const note of (draft.warnings || []).slice(0, 12)) {
      warnings.append(el("li", note));
    }
    output.append(warnings);
    const references = el("div", null, "toolbar");
    for (const reference of (draft.references || []).slice(0, 6)) {
      let url;
      try {
        url = new URL(reference.url);
      } catch {
        continue;
      }
      if (
        url.protocol !== "https:" ||
        !/(^|\.)alibaba\.com$/.test(url.hostname) || url.username ||
        url.password || url.port
      ) continue;
      const link = el("a", reference.label);
      link.href = url.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      references.append(link);
    }
    output.append(
      references,
      el(
        "small",
        "These references are supplier statements, not independent certification. The product’s supplier link is saved when you save the product.",
      ),
    );
    const images = (draft.image_urls || []).map(imageUrl).filter(Boolean).slice(
      0,
      12,
    );
    if (images.length) {
      output.append(
        el("h4", "Choose a supplier photo"),
        el("p", "Imported photos need permission before publication.", "muted"),
      );
      const gallery = el("div", null, "import-images");
      for (const [index, url] of images.entries()) {
        const button = el("button", null, "import-image");
        button.type = "button";
        button.setAttribute("aria-label", `Use supplier photo ${index + 1}`);
        button.setAttribute(
          "aria-pressed",
          String(url === draft.fields.image_url),
        );
        const img = el("img");
        img.src = url;
        img.alt = `Supplier product photo ${index + 1}`;
        img.loading = "lazy";
        img.referrerPolicy = "no-referrer";
        button.append(img, el("span", `Photo ${index + 1}`));
        button.addEventListener("click", () => {
          for (const other of gallery.querySelectorAll("button")) {
            other.setAttribute("aria-pressed", "false");
          }
          button.setAttribute("aria-pressed", "true");
          current.fields.image_url = url;
          if (applied) chooseImage(url);
        });
        gallery.append(button);
      }
      output.append(gallery);
    }
    const existing = findExisting(draft);
    if (existing) {
      output.append(
        el(
          "p",
          `This source is already saved as “${existing.title}”. Using this import loads updated details for that entry; review before saving.`,
          "notice",
        ),
      );
    }
    const actions = el("div", null, "toolbar");
    const use = el(
      "button",
      existing ? "Update existing entry in editor" : "Use draft in editor",
    );
    use.type = "button";
    use.addEventListener("click", () => {
      apply(importedFields(current), existing?.id || "");
      applied = true;
      use.disabled = true;
      setMessage(
        "Draft loaded into the editor. Review the details, then click Save product. Nothing has been published.",
      );
    });
    actions.append(use);
    output.append(
      actions,
      el(
        "small",
        "Using this draft replaces the current editor contents. It does not save or publish.",
      ),
    );
    setMessage(
      "Import ready. Review the draft below, then use it in the editor.",
    );
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const ticket = ++sequence;
    current = null;
    output.hidden = true;
    output.replaceChildren();
    const url = form.elements.source_url.value.trim();
    const pasted = form.elements.pasted_text.value.trim();
    const usePasted = event.submitter?.name === "use_pasted";
    if (usePasted && pasted.length < 20) {
      setMessage(
        "Paste the product title and details first (at least 20 characters).",
        true,
      );
      return;
    }
    setBusy(true);
    setMessage(
      usePasted
        ? "Reading the pasted product details…"
        : "Reading the supplier listing…",
    );
    try {
      const draft = await request({
        source_url: url,
        ...(usePasted ? { pasted_text: pasted } : {}),
      });
      if (ticket === sequence) show(draft);
    } catch (error) {
      if (ticket === sequence) {
        setMessage(
          error.message ||
            "The import failed. Try again or paste the page text.",
          true,
        );
        fallback.open = true;
      }
    } finally {
      if (ticket === sequence) setBusy(false);
    }
  });
  return { clear };
}
