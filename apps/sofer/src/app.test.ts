import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { serve } from "@hono/node-server";
import { generateShaliachKeypair, type ShaliachKeypair } from "@sefer/core";
import { InMemoryAuditLog, InMemoryReshumaStore, Sofer } from "@sefer/sofer-kit";
import { Sefer, SeferHttpError } from "@sefer/sdk";
import { createApp } from "./app";

interface Running {
  base: string;
  close: () => Promise<void>;
}

function start(): Promise<Running> {
  const store = new InMemoryReshumaStore();
  const audit = new InMemoryAuditLog();
  const sofer = new Sofer(store, { audit });
  const app = createApp({ sofer, audit });
  return new Promise((resolve) => {
    const server = serve({ fetch: app.fetch, port: 0 }, (info) => {
      resolve({
        base: `http://localhost:${info.port}`,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

const geocoderParams = {
  shem: "shem://acme.maps.geocoder",
  version: "1.4.0",
  endpoints: [{ protocol: "mcp", transport: "http", url: "https://geocoder.acme.dev/mcp" }] as const,
  capabilities: [
    { id: "geocode", intent: "turn a street address into latitude and longitude", ref: "mcp:tool/geocode", tags: ["geo", "maps"] },
  ],
};

describe("Sofer service — full inscribe/resolve/discover loop via the SDK", () => {
  let server: Running;
  let client: Sefer;
  let keypair: ShaliachKeypair;

  beforeAll(async () => {
    server = await start();
    client = new Sefer({ sofer: server.base });
    keypair = generateShaliachKeypair();
  });

  afterAll(async () => {
    await server.close();
  });

  it("inscribes a shaliach", async () => {
    const { response } = await client.inscribe({ ...geocoderParams, endpoints: [...geocoderParams.endpoints] }, keypair);
    expect(response.ok).toBe(true);
    expect(response.shem).toBe("shem://acme.maps.geocoder");
    expect(response.level).toBe("self");
  });

  it("resolves it and verifies the seal locally", async () => {
    const resolved = await client.resolve("shem://acme.maps.geocoder");
    expect(resolved).not.toBeNull();
    expect(resolved?.verify.ok).toBe(true);
    expect(resolved?.record.shaliach.id).toBe("did:sefer:acme.maps:geocoder");
  });

  it("discovers it by intent — no prior knowledge of the name", async () => {
    const results = await client.discover({ intent: "convert a postal address into coordinates" });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.record.shaliach.name).toBe("geocoder");
    expect(results[0]?.verify.ok).toBe(true);
    expect(results[0]?.matchedCapabilities).toContain("geocode");
  });

  it("returns null for an unknown shem", async () => {
    expect(await client.resolve("shem://acme.maps.nonexistent")).toBeNull();
  });

  it("rejects a takeover by a different key (TOFU → 409)", async () => {
    const impostor = new Sefer({ sofer: server.base });
    await expect(
      impostor.inscribe({ ...geocoderParams, endpoints: [...geocoderParams.endpoints] }, generateShaliachKeypair()),
    ).rejects.toBeInstanceOf(SeferHttpError);
  });

  it("exposes a verifiable audit chain", async () => {
    const res = await fetch(`${server.base}/v1/audit`);
    const body = (await res.json()) as { entries: unknown[]; chain: { ok: boolean } };
    expect(body.entries.length).toBeGreaterThanOrEqual(1);
    expect(body.chain.ok).toBe(true);
  });
});
