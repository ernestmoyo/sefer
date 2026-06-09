/**
 * One-command Sefer demo. Stands up a Sofer in-process, has a geocoder inscribe itself,
 * then has a *different* client discover it by intent and resolve it with local seal
 * verification — the whole "name, find, trust" loop with zero hand-wiring.
 *
 *   npm run demo
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { generateShaliachKeypair, type CreateReshumaParams } from "@sefer/core";
import { InMemoryAuditLog, InMemoryReshumaStore, Sofer } from "@sefer/sofer-kit";
import { Sefer } from "@sefer/sdk";

async function main(): Promise<void> {
  // ── 1. Stand up a Sofer (registry). The HTTP glue is deliberately tiny. ──
  const sofer = new Sofer(new InMemoryReshumaStore(), { audit: new InMemoryAuditLog() });
  const app = new Hono();
  app.post("/v1/inscribe", async (c) => c.json(await sofer.inscribe(await c.req.json())));
  app.get("/v1/resolve", async (c) => {
    const record = await sofer.resolve(c.req.query("shem") ?? "");
    return record ? c.json(record) : c.json({ error: "not found" }, 404);
  });
  app.get("/v1/discover", async (c) => {
    const intent = c.req.query("intent");
    return c.json({ results: await sofer.discover(intent ? { intent } : {}) });
  });

  const server = await new Promise<{ port: number; close: () => void }>((resolve) => {
    const s = serve({ fetch: app.fetch, port: 0 }, (info) =>
      resolve({ port: info.port, close: () => s.close() }),
    );
  });
  const base = `http://localhost:${server.port}`;
  console.log(`✶ Sofer up at ${base}\n`);

  // ── 2. A geocoder shaliach inscribes itself (self-sovereign key, self-sealed). ──
  const client = new Sefer({ sofer: base });
  const keypair = generateShaliachKeypair();
  const params: CreateReshumaParams = {
    shem: "shem://demo.maps.geocoder",
    version: "1.0.0",
    endpoints: [{ protocol: "mcp", transport: "http", url: "https://geocoder.demo.dev/mcp" }],
    capabilities: [
      { id: "geocode", intent: "turn a street address into latitude and longitude", ref: "mcp:tool/geocode", tags: ["geo", "maps"] },
    ],
  };
  const { response } = await client.inscribe(params, keypair);
  console.log("① inscribed shem://demo.maps.geocoder →", response, "\n");

  // ── 3. Another agent discovers it BY INTENT — it never knew the name. ──
  const hits = await client.discover({ intent: "convert a postal address to coordinates" });
  console.log('② discovered by intent "convert a postal address to coordinates":');
  for (const hit of hits) {
    const ep = hit.record.endpoints[0];
    console.log(`   → ${hit.record.shem}  (score ${hit.score.toFixed(2)}, seal ${hit.verify.ok ? "VALID ✓" : "INVALID ✗"})`);
    console.log(`     reach via: ${ep?.protocol} ${ep?.url}`);
  }
  console.log();

  // ── 4. Resolve by name, verifying the seal locally (the registry is not trusted). ──
  const resolved = await client.resolve("shem://demo.maps.geocoder");
  console.log("③ resolved by name, locally verified:", resolved?.verify, "\n");

  server.close();
  console.log("done — name, find, trust. ✦");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
