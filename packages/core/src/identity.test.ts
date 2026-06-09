import { describe, it, expect } from "vitest";
import { generateShaliachKeypair, jwkThumbprint, deriveDid, publicPart } from "./identity";
import { parseShem } from "./address";

describe("identity", () => {
  it("generates an Ed25519 keypair with matching thumbprint kid", () => {
    const kp = generateShaliachKeypair();
    expect(kp.publicJwk.kty).toBe("OKP");
    expect(kp.publicJwk.crv).toBe("Ed25519");
    expect(kp.publicJwk.x.length).toBeGreaterThan(0);
    expect(kp.privateJwk.d).toBeDefined();
    expect(kp.kid).toBe(jwkThumbprint(kp.publicJwk));
    expect(kp.kid.startsWith("u")).toBe(true);
  });

  it("produces distinct keys each call", () => {
    expect(generateShaliachKeypair().kid).not.toBe(generateShaliachKeypair().kid);
  });

  it("thumbprint is deterministic and ignores the private scalar", () => {
    const kp = generateShaliachKeypair();
    expect(jwkThumbprint(kp.publicJwk)).toBe(jwkThumbprint(kp.privateJwk));
  });

  it("publicPart strips the private scalar", () => {
    const kp = generateShaliachKeypair();
    expect(publicPart(kp.privateJwk).d).toBeUndefined();
  });

  it("derives did:sefer for namespaced and root shems", () => {
    expect(deriveDid(parseShem("acme.maps.geocoder"))).toBe("did:sefer:acme.maps:geocoder");
    expect(deriveDid(parseShem("triage"))).toBe("did:sefer:triage");
  });
});
