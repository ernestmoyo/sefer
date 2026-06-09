import { describe, it, expect } from "vitest";
import { createReshumah, generateShaliachKeypair, type CreateReshumaParams, type Reshuma } from "@sefer/core";
import { Sefer } from "./client";
import { SeferHttpError, SeferVerificationError } from "./errors";

const keypair = generateShaliachKeypair();
const baseParams: CreateReshumaParams = {
  shem: "shem://acme.maps.geocoder",
  version: "1.0.0",
  ttl: 300,
  endpoints: [{ protocol: "mcp", transport: "http", url: "https://geocoder.acme.dev/mcp" }],
  capabilities: [{ id: "geocode", intent: "address to coordinates", tags: ["geo"] }],
};

function validRecord(now = new Date("2026-06-09T00:00:00.000Z")): Reshuma {
  return createReshumah(baseParams, keypair, now);
}

type Handler = (url: string, init?: RequestInit) => Response;

function stubFetch(handler: Handler) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fn = async (input: unknown, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    calls.push({ url, init });
    return handler(url, init);
  };
  return Object.assign(fn as unknown as typeof fetch, { calls });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("Sefer.inscribe", () => {
  it("builds, seals, and POSTs a record", async () => {
    const fetchImpl = stubFetch(() => json({ ok: true, shem: "shem://acme.maps.geocoder", level: "self" }));
    const client = new Sefer({ sofer: "https://sofer.test/", fetch: fetchImpl });
    const { record, response } = await client.inscribe(baseParams, keypair);

    expect(response.ok).toBe(true);
    expect(record.shaliach.id).toBe("did:sefer:acme.maps:geocoder");
    expect(fetchImpl.calls[0]?.url).toBe("https://sofer.test/v1/inscribe");
    expect(fetchImpl.calls[0]?.init?.method).toBe("POST");
  });

  it("throws on a non-2xx inscribe", async () => {
    const fetchImpl = stubFetch(() => json({ ok: false, code: "ERR_NAME_BOUND" }, 409));
    const client = new Sefer({ sofer: "https://sofer.test", fetch: fetchImpl });
    await expect(client.inscribe(baseParams, keypair)).rejects.toBeInstanceOf(SeferHttpError);
  });
});

describe("Sefer.resolve", () => {
  it("resolves, verifies, and caches within TTL", async () => {
    const record = validRecord();
    const fetchImpl = stubFetch(() => json(record));
    let clock = new Date("2026-06-09T00:01:00.000Z");
    const client = new Sefer({ sofer: "https://sofer.test", fetch: fetchImpl, now: () => clock });

    const first = await client.resolve("shem://acme.maps.geocoder");
    expect(first?.verify.ok).toBe(true);
    expect(fetchImpl.calls).toHaveLength(1);

    // Second call within TTL → served from cache, no extra fetch.
    clock = new Date("2026-06-09T00:02:00.000Z");
    await client.resolve("shem://acme.maps.geocoder");
    expect(fetchImpl.calls).toHaveLength(1);

    // Past TTL → refetch.
    clock = new Date("2026-06-09T00:10:00.000Z");
    await client.resolve("shem://acme.maps.geocoder");
    expect(fetchImpl.calls).toHaveLength(2);
  });

  it("returns null on 404", async () => {
    const fetchImpl = stubFetch(() => json({ error: "no such shem" }, 404));
    const client = new Sefer({ sofer: "https://sofer.test", fetch: fetchImpl });
    expect(await client.resolve("shem://acme.maps.ghost")).toBeNull();
  });

  it("throws when the served record fails verification", async () => {
    const record = validRecord();
    const tampered = { ...record, shaliach: { ...record.shaliach, version: "9.9.9" } };
    const fetchImpl = stubFetch(() => json(tampered));
    const client = new Sefer({ sofer: "https://sofer.test", fetch: fetchImpl, cache: false });
    await expect(client.resolve("shem://acme.maps.geocoder")).rejects.toBeInstanceOf(SeferVerificationError);
  });

  it("throws SeferHttpError on a 500", async () => {
    const fetchImpl = stubFetch(() => json({ error: "boom" }, 500));
    const client = new Sefer({ sofer: "https://sofer.test", fetch: fetchImpl });
    await expect(client.resolve("shem://acme.maps.geocoder")).rejects.toBeInstanceOf(SeferHttpError);
  });
});

describe("Sefer.discover", () => {
  it("builds the query string and drops unverifiable results", async () => {
    const good = validRecord();
    const bad = { ...validRecord(), shaliach: { ...validRecord().shaliach, version: "0.0.0" } };
    const fetchImpl = stubFetch(() =>
      json({
        results: [
          { record: good, score: 2, matchedCapabilities: ["geocode"] },
          { record: bad, score: 1, matchedCapabilities: ["geocode"] },
        ],
      }),
    );
    const client = new Sefer({ sofer: "https://sofer.test", fetch: fetchImpl });
    const hits = await client.discover({ intent: "address to coords", parashah: "acme", tags: ["geo"], limit: 5 });

    expect(hits).toHaveLength(1); // the tampered one is dropped
    expect(hits[0]?.verify.ok).toBe(true);

    const url = fetchImpl.calls[0]?.url ?? "";
    expect(url).toContain("intent=address");
    expect(url).toContain("parashah=acme");
    expect(url).toContain("tags=geo");
    expect(url).toContain("limit=5");
  });
});
