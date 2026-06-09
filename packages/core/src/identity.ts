import { createHash, generateKeyPairSync } from "node:crypto";
import { z } from "zod";
import { base64url } from "./encoding";
import type { Shem } from "./address";

/** An Ed25519 key as a JSON Web Key (RFC 8037). `d` is the private scalar. */
export const JwkSchema = z.object({
  kty: z.literal("OKP"),
  crv: z.literal("Ed25519"),
  x: z.string().min(1),
  d: z.string().min(1).optional(),
});

export type Jwk = z.infer<typeof JwkSchema>;

/** A freshly generated shaliach keypair plus its key id (thumbprint). */
export interface ShaliachKeypair {
  /** Public key — safe to publish inside a reshumah. */
  readonly publicJwk: Jwk;
  /** Private key — never leaves the shaliach; never inscribed. */
  readonly privateJwk: Jwk;
  /** RFC 7638 thumbprint of the public key, multibase-`u` (base64url) encoded. */
  readonly kid: string;
}

/**
 * RFC 7638 JWK thumbprint for an Ed25519 (OKP) key: SHA-256 over the canonical member
 * set {crv, kty, x} in lexicographic order, base64url-encoded, multibase-`u` prefixed.
 */
export function jwkThumbprint(jwk: Pick<Jwk, "crv" | "kty" | "x">): string {
  const input = `{"crv":"${jwk.crv}","kty":"${jwk.kty}","x":"${jwk.x}"}`;
  const digest = createHash("sha256").update(input, "utf8").digest();
  return "u" + base64url(digest);
}

/** Generate a new self-sovereign Ed25519 identity for a shaliach. */
export function generateShaliachKeypair(): ShaliachKeypair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pub = publicKey.export({ format: "jwk" }) as unknown as Jwk;
  const priv = privateKey.export({ format: "jwk" }) as unknown as Jwk;
  const publicJwk: Jwk = { kty: "OKP", crv: "Ed25519", x: pub.x };
  const kid = jwkThumbprint(publicJwk);
  return { publicJwk, privateJwk: priv, kid };
}

/** Strip a JWK down to its public members. */
export function publicPart(jwk: Jwk): Jwk {
  return { kty: jwk.kty, crv: jwk.crv, x: jwk.x };
}

/**
 * Derive the stable `did:sefer` identity for a shem, e.g.
 * `{parashah:["acme","maps"], name:"geocoder"} → "did:sefer:acme.maps:geocoder"`.
 */
export function deriveDid(shem: Shem): string {
  const ns = shem.parashah.length > 0 ? shem.parashah.join(".") + ":" : "";
  return `did:sefer:${ns}${shem.name}`;
}
