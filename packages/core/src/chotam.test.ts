import { describe, it, expect } from "vitest";
import { signObject, verifyObject } from "./chotam";
import { generateShaliachKeypair } from "./identity";

describe("chotam sign/verify", () => {
  it("verifies a signature it produced", () => {
    const kp = generateShaliachKeypair();
    const obj = { a: 1, b: "two", c: [3, 4] };
    const seal = signObject(obj, kp.privateJwk, kp.kid, "2026-06-09T00:00:00.000Z");
    expect(seal.alg).toBe("ed25519");
    expect(seal.kid).toBe(kp.kid);
    expect(verifyObject(obj, kp.publicJwk, seal.sig)).toBe(true);
  });

  it("is order-independent (canonicalization)", () => {
    const kp = generateShaliachKeypair();
    const seal = signObject({ a: 1, b: 2 }, kp.privateJwk, kp.kid, "2026-06-09T00:00:00.000Z");
    expect(verifyObject({ b: 2, a: 1 }, kp.publicJwk, seal.sig)).toBe(true);
  });

  it("rejects a tampered object", () => {
    const kp = generateShaliachKeypair();
    const seal = signObject({ a: 1 }, kp.privateJwk, kp.kid, "2026-06-09T00:00:00.000Z");
    expect(verifyObject({ a: 2 }, kp.publicJwk, seal.sig)).toBe(false);
  });

  it("rejects verification under a different key", () => {
    const a = generateShaliachKeypair();
    const b = generateShaliachKeypair();
    const seal = signObject({ a: 1 }, a.privateJwk, a.kid, "2026-06-09T00:00:00.000Z");
    expect(verifyObject({ a: 1 }, b.publicJwk, seal.sig)).toBe(false);
  });

  it("returns false (not throws) on a malformed signature", () => {
    const kp = generateShaliachKeypair();
    expect(verifyObject({ a: 1 }, kp.publicJwk, "!!!not-base64url!!!")).toBe(false);
  });
});
