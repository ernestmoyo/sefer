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
/** Upper bound on counter-seals per record — comfortably above any real federation size. */
export const MAX_COUNTER_SEALS = 64;

export const CounterSealSchema = z.object({
  kid: z.string().min(1),
  sig: z.string().min(1),
  /**
   * The signer's self-asserted role. ADVISORY ONLY — a verifier MUST derive the granted
   * trust level from its own trusted-issuer entry for this `kid`, never from this field.
   */
  role: z.string().min(1),
  signedAt: z.string().datetime(),
  /** Optional pointer to the DomainProof a 'verified'-role seal attests (Phase 2+). */
  proofRef: z.string().min(1).optional(),
});

export type CounterSeal = z.infer<typeof CounterSealSchema>;

export const ChotamSchema = z.object({
  alg: z.literal("ed25519"),
  /** base64url Ed25519 signature over the canonicalized reshumah sans chotam. */
  sig: z.string().min(1),
  /** Signer key id — MUST equal the reshumah's publicKey.kid for a self-seal. */
  kid: z.string().min(1),
  signedAt: z.string().datetime(),
  /**
   * Optional vouching seals by Sofarim / orgs (trust escalation). Bounded to limit CPU
   * (verification is O(seals)) and storage amplification from a hostile submitter, since
   * counter-seals live outside the signed body and are attacker-controllable on the wire.
   */
  counterSeals: z.array(CounterSealSchema).max(MAX_COUNTER_SEALS).optional(),
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

// ── Domain-separated signing (sefer/0.2) ──────────────────────────────────────────────
//
// Every NEW signed object kind (counter-seal, and later rotation seal, negative response,
// attestation) MUST sign through `signTagged`, which folds a constant type tag into the
// signed preimage. Without this, a signature minted for one purpose could be replayed as
// another (cross-protocol signature confusion). The reshumah self-seal keeps using
// `signObject` for sefer/0.1 wire-compatibility — its in-body `v` + full record shape are
// its discriminator, and it can never collide with a tagged preimage's bytes.
// See docs/PROTOCOL.md §4.3.

/** A detached, domain-tagged signature (the chotam without alg, for counter-seals etc.). */
export interface TaggedSignature {
  sig: string;
  kid: string;
  signedAt: string;
}

/** The exact bytes signed for a tagged object kind: `{ typ, payload }` in canonical JSON. */
export function taggedBytes(typ: string, payload: Record<string, unknown>): Uint8Array {
  return canonicalBytes({ typ, payload });
}

/** Sign a domain-tagged preimage. `typ` is a constant like `"sefer-counterseal/0.2"`. */
export function signTagged(
  typ: string,
  payload: Record<string, unknown>,
  privateJwk: Jwk,
  kid: string,
  signedAt: string,
): TaggedSignature {
  const signature = edSign(null, taggedBytes(typ, payload), toPrivateKey(privateJwk));
  return { sig: base64url(signature), kid, signedAt };
}

/** Verify a domain-tagged signature. The verifier supplies the expected `typ`. */
export function verifyTagged(
  typ: string,
  payload: Record<string, unknown>,
  publicJwk: Jwk,
  sigB64url: string,
): boolean {
  try {
    return edVerify(null, taggedBytes(typ, payload), toPublicKey(publicJwk), fromBase64url(sigB64url));
  } catch {
    return false;
  }
}
