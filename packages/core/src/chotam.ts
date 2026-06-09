import { createPrivateKey, createPublicKey, sign as edSign, verify as edVerify } from "node:crypto";
import { z } from "zod";
import { canonicalBytes } from "./canonical";
import { base64url, fromBase64url } from "./encoding";
import type { Jwk } from "./identity";

/**
 * The chotam — the seal that makes a reshumah self-certifying. A caller verifies the
 * record against the embedded public key and need not trust the Sofer that served it.
 * See docs/PROTOCOL.md §4.
 */
export const CounterSealSchema = z.object({
  kid: z.string().min(1),
  sig: z.string().min(1),
  role: z.string().min(1),
  signedAt: z.string().datetime(),
});

export type CounterSeal = z.infer<typeof CounterSealSchema>;

export const ChotamSchema = z.object({
  alg: z.literal("ed25519"),
  /** base64url Ed25519 signature over the canonicalized reshumah sans chotam. */
  sig: z.string().min(1),
  /** Signer key id — MUST equal the reshumah's publicKey.kid for a self-seal. */
  kid: z.string().min(1),
  signedAt: z.string().datetime(),
  /** Optional vouching seals by Sofarim / orgs (trust escalation; Phase 2). */
  counterSeals: z.array(CounterSealSchema).optional(),
});

export type Chotam = z.infer<typeof ChotamSchema>;

// createPrivateKey/createPublicKey accept a JWK input; we cast through the exact
// parameter type to stay strict without depending on node's JsonWebKey type surface.
function toPrivateKey(jwk: Jwk) {
  return createPrivateKey(
    { key: jwk, format: "jwk" } as unknown as Parameters<typeof createPrivateKey>[0],
  );
}

function toPublicKey(jwk: Jwk) {
  return createPublicKey(
    { key: jwk, format: "jwk" } as unknown as Parameters<typeof createPublicKey>[0],
  );
}

/**
 * Sign an arbitrary object's canonical form, producing a chotam. The caller is
 * responsible for passing the object *without* its `chotam` field.
 */
export function signObject(
  obj: Record<string, unknown>,
  privateJwk: Jwk,
  kid: string,
  signedAt: string,
): Chotam {
  const signature = edSign(null, canonicalBytes(obj), toPrivateKey(privateJwk));
  return { alg: "ed25519", sig: base64url(signature), kid, signedAt };
}

/** Verify a base64url signature over an object's canonical form against a public JWK. */
export function verifyObject(
  obj: Record<string, unknown>,
  publicJwk: Jwk,
  sigB64url: string,
): boolean {
  try {
    return edVerify(null, canonicalBytes(obj), toPublicKey(publicJwk), fromBase64url(sigB64url));
  } catch {
    return false;
  }
}
