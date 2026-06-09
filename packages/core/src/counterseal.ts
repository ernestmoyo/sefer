import { signTagged, verifyTagged, type CounterSeal } from "./chotam";
import type { Jwk, ShaliachKeypair } from "./identity";
import type { Reshuma } from "./reshumah";

/**
 * Counter-seals (sefer/0.2). A Sofer (or org) vouches for a record it accepts by signing a
 * dedicated, domain-separated preimage — NOT the same bytes as the self-seal. The preimage
 * commits to:
 *   - the constant type tag (domain separation; blocks cross-protocol signature confusion),
 *   - the self-seal's signature (`chotam.sig`), binding the vouch to that exact sealed
 *     record — so re-sealing the record invalidates every prior counter-seal, and
 *     (enforced in {@link computeEffectiveLevel}) an expired record grants no level and a
 *     post-dated seal is ignored,
 *   - the subject's public key id (`publicKey.kid`),
 *   - and the seal's own `role`, `signedAt`, and optional `proofRef`.
 *
 * A verifier later checks the seal against an issuer key it independently trusts, and
 * derives the granted trust level from ITS OWN trust config — never from `role` in the
 * seal. See docs/PROTOCOL.md §4.3 and docs/ARCHITECTURE.md §4.
 */
export const COUNTERSEAL_TYP = "sefer-counterseal/0.2";

function counterSealPayload(
  record: Reshuma,
  role: string,
  signedAt: string,
  proofRef?: string,
): Record<string, unknown> {
  return {
    sealSig: record.chotam.sig,
    subjectKid: record.publicKey.kid,
    role,
    signedAt,
    ...(proofRef !== undefined ? { proofRef } : {}),
  };
}

/** Produce a counter-seal over a sealed reshumah, signed with the issuer's key. */
export function counterSealReshumah(
  record: Reshuma,
  issuer: ShaliachKeypair,
  role: string,
  signedAt: string,
  proofRef?: string,
): CounterSeal {
  const payload = counterSealPayload(record, role, signedAt, proofRef);
  const { sig } = signTagged(COUNTERSEAL_TYP, payload, issuer.privateJwk, issuer.kid, signedAt);
  return {
    kid: issuer.kid,
    sig,
    role,
    signedAt,
    ...(proofRef !== undefined ? { proofRef } : {}),
  };
}

/**
 * Verify a counter-seal against a public key the caller independently trusts. Returns true
 * only if the seal's signature covers the domain-tagged preimage derived from THIS record.
 */
export function verifyCounterSeal(record: Reshuma, seal: CounterSeal, issuerJwk: Jwk): boolean {
  const payload = counterSealPayload(record, seal.role, seal.signedAt, seal.proofRef);
  return verifyTagged(COUNTERSEAL_TYP, payload, issuerJwk, seal.sig);
}

/** Return a new record with `seal` appended to `chotam.counterSeals` (additive, immutable). */
export function appendCounterSeal(record: Reshuma, seal: CounterSeal): Reshuma {
  const existing = record.chotam.counterSeals ?? [];
  return {
    ...record,
    chotam: { ...record.chotam, counterSeals: [...existing, seal] },
  };
}
