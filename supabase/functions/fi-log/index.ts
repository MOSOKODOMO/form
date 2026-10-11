import { handleLog } from "../_shared/log-handler.mjs";

Deno.serve((req: Request) =>
  handleLog(req, {
    env: {
      publishableKey: Deno.env.get("FI_LOG_PUBLISHABLE_KEY") ?? "",
      axiomToken: Deno.env.get("AXIOM_API_TOKEN") ?? "",
      axiomDataset: Deno.env.get("AXIOM_DATASET") ?? "",
      axiomDomain: Deno.env.get("AXIOM_DOMAIN") ?? "",
    },
  })
);
