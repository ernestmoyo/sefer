import { verifyCounterSeal } from "./counterseal";
import type { Jwk } from "./identity";
import type { Reshuma, TrustLevel } from "./reshumah";

/**
 * An issuer the CALLER chooses to trust, and the level its counter-seal grants. The grant
 * is the caller's policy decision (PKI-style: "I trust this Sofer's key to vouch"), so the
 * effective level never depends on what the seal claims about itself.
 *
 * `grants: "verified"` means the caller has itself established that this issuer is a
 * verification authority — i.e. the caller takes responsibility for the key↔org binding,
 * out of band. A later increment adds **DomainProof** to *automate discovering* such
 * issuers (DNS/X.509), but an explicit caller configuration is always a valid anchor; the
 * automation is a convenience, not a precondition.
 */
export interface TrustedIssuer {
  kid: string;
  jwk: Jwk;
  /** The level a verified seal from this issuer grants: "vouched" or "verified". */
  grants: Exclude<TrustLevel, "self">;
}

/** A counter-seal that both verified cryptographically AND came from a trusted issuer. */
export interface RecognizedSeal {
  kid: string;
  /** The seal's self-asserted role (advisory; informational only). */
  role: string;
  /** The level granted, taken from the caller's trust entry. */
  grants: Exclude<TrustLevel, "self">;
}

function rank(level: TrustLevel): number {
  return level === "verified" ? 2 : level === "vouched" ? 1 : 0;
}

/**
 * Compute the effective trust level of a (already self-seal-verified) record from the
 * counter-seals the caller recognizes. The level is the highest grant among recognized
 * seals, or "self" if none. A seal is recognized only if its `kid` is trusted AND its
 * signature verifies. Freshness is enforced so a vouch cannot outlive what it vouches for:
 *
 *  - if the record is already expired at `now`, NO elevation occurs (a stale record is
 *    only ever "self", matching the "counter-seal inherits the record's freshness" intent);
 *  - a post-dated seal (`signedAt` in the future relative to `now`) is ignored.
 */
export function computeEffectiveLevel(
  record: Reshuma,
  trustedIssuers: readonly TrustedIssuer[],
  now: Date = new Date(),
): { level: TrustLevel; recognizedSeals: RecognizedSeal[] } {
  const expiresAt = record.meta.expiresAt;
  if (expiresAt !== undefined && new Date(expiresAt).getTime() < now.getTime()) {
    return { level: "self", recognizedSeals: [] }; // expired → no vouch survives
  }

  const nowMs = now.getTime();
  const byKid = new Map(trustedIssuers.map((issuer) => [issuer.kid, issuer]));
  const recognizedSeals: RecognizedSeal[] = [];
  let level: TrustLevel = "self";

  for (const seal of record.chotam.counterSeals ?? []) {
    const issuer = byKid.get(seal.kid);
    if (!issuer) continue; // signer the caller does not trust → ignored
    if (new Date(seal.signedAt).getTime() > nowMs) continue; // post-dated → ignored
    if (!verifyCounterSeal(record, seal, issuer.jwk)) continue; // bad signature → ignored
    recognizedSeals.push({ kid: seal.kid, role: seal.role, grants: issuer.grants });
    if (rank(issuer.grants) > rank(level)) level = issuer.grants;
  }

  return { level, recognizedSeals };
}
