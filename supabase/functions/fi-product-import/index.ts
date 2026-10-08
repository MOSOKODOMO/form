import { createClient } from "@supabase/supabase-js";
import { handleProductImport } from "../_shared/product-import-handler.mjs";

Deno.serve((req: Request) =>
  handleProductImport(req, {
    client: createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    ),
  })
);
