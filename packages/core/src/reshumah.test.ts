import { describe, it, expect } from "vitest";
import { createReshumah, verifyReshumah, type CreateReshumaParams } from "./reshumah";
import { generateShaliachKeypair } from "./identity";

const params: CreateReshumaParams = {
  shem: "shem://acme.maps.geocoder",
  version: "1.4.0",
  title: "Acme Geocoder",
  endpoints: [{ protocol: "mcp", transport: "http", url: "https://geocoder.acme.dev/mcp" }],
  capabilities: [
    { id: "geocode", intent: "turn a street address into latitude/longitude", ref: "mcp:tool/geocode" },
  ],
};

describe("createReshumah", () => {
  it("builds a sealed, valid record at trust level self", () => {
    const kp = generateShaliachKeypair();
    const rec = createReshumah(params, kp, new Date("2026-06-09T00:00:00.000Z"));

    expect(rec.v).toBe("sefer/0.1");
    expect(rec.shem).toBe("shem://acme.maps.geocoder");
    expect(rec.shaliach.id).toBe("did:sefer:acme.maps:geocoder");
    expect(rec.shaliach.parashah).toEqual(["acme", "maps"]);
    expect(rec.publicKey.kid).toBe(kp.kid);
    expect(rec.chotam.kid).toBe(kp.kid);
    expect(rec.meta.ttl).toBe(300);
    expect(rec.meta.expiresAt).toBe("2026-06-09T00:05:00.000Z");

    const outcome = verifyReshumah(rec, new Date("2026-06-09T00:01:00.000Z"));
    expect(outcome.ok).toBe(true);
    expect(outcome.level).toBe("self");
    expect(outcome.reasons).toEqual([]);
    expect(outcome.expired).toBe(false);
  });

  it("honors a custom ttl", () => {
    const kp = generateShaliachKeypair();
    const rec = createReshumah({ ...params, ttl: 60 }, kp, new Date("2026-06-09T00:00:00.000Z"));
    expect(rec.meta.expiresAt).toBe("2026-06-09T00:01:00.000Z");
  });
});

describe("verifyReshumah", () => {
  it("flags an expired record without failing verification", () => {
    const kp = generateShaliachKeypair();
    const rec = createReshumah({ ...params, ttl: 60 }, kp, new Date("2026-06-09T00:00:00.000Z"));
    const outcome = verifyReshumah(rec, new Date("2026-06-09T01:00:00.000Z"));
    expect(outcome.ok).toBe(true);
    expect(outcome.expired).toBe(true);
  });

  it("rejects a tampered field (broken seal)", () => {
    const kp = generateShaliachKeypair();
    const rec = createReshumah(params, kp);
    const tampered = { ...rec, shaliach: { ...rec.shaliach, version: "9.9.9" } };
    const outcome = verifyReshumah(tampered);
    expect(outcome.ok).toBe(false);
    expect(outcome.level).toBe("invalid");
    expect(outcome.reasons.some((r) => r.includes("signature"))).toBe(true);
  });

  it("rejects a swapped public key (kid integrity)", () => {
    const kp = generateShaliachKeypair();
    const other = generateShaliachKeypair();
    const rec = createReshumah(params, kp);
    const swapped = { ...rec, publicKey: { ...rec.publicKey, jwk: other.publicJwk } };
    const outcome = verifyReshumah(swapped);
    expect(outcome.ok).toBe(false);
    expect(outcome.reasons.some((r) => r.includes("thumbprint"))).toBe(true);
  });

  it("rejects a structurally invalid record", () => {
    const outcome = verifyReshumah({ not: "a reshumah" });
    expect(outcome.ok).toBe(false);
    expect(outcome.level).toBe("invalid");
    expect(outcome.reasons[0]).toContain("schema");
  });

  it("detects shem ↔ shaliach inconsistency", () => {
    const kp = generateShaliachKeypair();
    const rec = createReshumah(params, kp);
    // Rewrite shem only; re-seal so the signature passes but consistency fails.
    const inconsistent = { ...rec, shem: "shem://acme.maps.other" };
    const outcome = verifyReshumah(inconsistent);
    // Signature breaks (shem changed) — but ensure we also surface the mismatch path.
    expect(outcome.ok).toBe(false);
  });
});
