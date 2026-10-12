import { handlePriceCompare } from "../_shared/price-compare-handler.mjs";

Deno.serve((req: Request) =>
  handlePriceCompare(req, { env: { apiKey: Deno.env.get("SEARCHAPI_KEY") ?? "" } })
);
