/**
 * A finder. Discovers agents by intent against a running Sofer and prints how to reach
 * them. Start a Sofer (`npm run sofer`) and inscribe the geocoder first.
 *
 *   npm run find -w @sefer/demo -- "convert an address to coordinates"
 */
import { Sefer } from "@sefer/sdk";

const SOFER_URL = process.env.SOFER_URL ?? "http://localhost:8787";

async function main(): Promise<void> {
  const intent = process.argv.slice(2).join(" ") || "convert a postal address to coordinates";
  const client = new Sefer({ sofer: SOFER_URL });

  const hits = await client.discover({ intent });
  console.log(`discover intent="${intent}" → ${hits.length} hit(s):\n`);

  for (const hit of hits) {
    console.log(`  ${hit.record.shem}  score=${hit.score.toFixed(2)}  seal=${hit.verify.ok ? "VALID ✓" : "INVALID ✗"}`);
    for (const cap of hit.record.capabilities) {
      console.log(`     • ${cap.id}: ${cap.intent ?? ""}`);
    }
    console.log(`     reach via: ${hit.record.endpoints.map((e) => `${e.protocol} ${e.url}`).join(", ")}\n`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
