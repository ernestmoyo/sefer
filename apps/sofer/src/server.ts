import { serve } from "@hono/node-server";
import { InMemoryAuditLog, InMemoryReshumaStore, Sofer } from "@sefer/sofer-kit";
import { createApp } from "./app";

const port = Number.parseInt(process.env.PORT ?? "8787", 10);

const store = new InMemoryReshumaStore();
const audit = new InMemoryAuditLog();
const sofer = new Sofer(store, { audit });
const app = createApp({ sofer, audit });

serve({ fetch: app.fetch, port }, (info) => {
  // eslint-disable-next-line no-console
  console.log(`✶ Sofer listening on http://localhost:${info.port}  (protocol sefer/0.1, in-memory store)`);
});
