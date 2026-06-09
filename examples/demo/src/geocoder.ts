/**
 * A geocoder shaliach. Inscribes itself into a running Sofer and keeps its record fresh
 * with a heartbeat. Start a Sofer first (`npm run sofer`), then run this.
 *
 *   SOFER_URL=http://localhost:8787 npm run inscribe -w @sefer/demo
 */
import { generateShaliachKeypair, type CreateReshumaParams } from "@sefer/core";
import { Sefer } from "@sefer/sdk";

const SOFER_URL = process.env.SOFER_URL ?? "http://localhost:8787";

async function main(): Promise<void> {
  const client = new Sefer({ sofer: SOFER_URL });

  // In production you persist this keypair securely — it IS the agent's identity.
  const keypair = generateShaliachKeypair();

  const params: CreateReshumaParams = {
    shem: "shem://demo.maps.geocoder",
    version: "1.0.0",
    title: "Demo Geocoder",
    endpoints: [{ protocol: "mcp", transport: "http", url: "https://geocoder.demo.dev/mcp" }],
    capabilities: [
      { id: "geocode", intent: "turn a street address into latitude and longitude", ref: "mcp:tool/geocode", tags: ["geo", "maps"] },
    ],
  };

  const { response } = await client.inscribe(params, keypair);
  console.log(`inscribed shem://demo.maps.geocoder →`, response);
  console.log(`identity kid: ${keypair.kid}`);

  client.heartbeat(params, keypair, {
    intervalMs: 60_000,
    onError: (err) => console.error("heartbeat error:", err),
  });
  console.log("heartbeating every 60s — Ctrl+C to stop.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
