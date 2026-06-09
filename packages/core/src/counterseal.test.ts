import { describe, it, expect } from "vitest";
import { createReshumah, ReshumaSchema, verifyReshumah, type CreateReshumaParams } from "./reshumah";
import { generateShaliachKeypair } from "./identity";
import {
  COUNTERSEAL_TYP,
  appendCounterSeal,
  counterSealReshumah,
  verifyCounterSeal,
} from "./counterseal";
import { computeEffectiveLevel, type TrustedIssuer } from "./trust";
import { MAX_COUNTER_SEALS, verifyObject, verifyTagged, type CounterSeal } from "./chotam";

const params: CreateReshumaParams = {
  shem: "shem://acme.maps.geocoder",
  version: "1.0.0",
  endpoints: [{ protocol: "mcp", transport: "http", url: "https://geocoder.acme.dev/mcp" }],
  capabilities: [{ id: "geocode", intent: "address to coordinates" }],
};
const at = "2026-06-09T00:00:00.000Z";

function setup() {
  const subject = generateShaliachKeypair();
  const sofer = generateShaliachKeypair();
  const record = createReshumah(params, subject, new Date(at));
  return { subject, sofer, record };
}

describe("counter-seal crypto", () => {
  it("verifies with the issuer key and fails with a foreign key", () => {
    const { sofer, record } = setup();
    const other = generateShaliachKeypair();
    const seal = counterSealReshumah(record, sofer, "sofer", at);
    expect(verifyCounterSeal(record, seal, sofer.publicJwk)).toBe(true);
    expect(verifyCounterSeal(record, seal, other.publicJwk)).toBe(false);
  });

  it("binds to the exact sealed record (different record → no verify)", () => {
    const { sofer, record } = setup();
    const seal = counterSealReshumah(record, sofer, "sofer", at);
    const otherRecord = createReshumah({ ...params, version: "2.0.0" }, generateShaliachKeypair(), new Date(at));
    expect(verifyCounterSeal(otherRecord, seal, sofer.publicJwk)).toBe(false);
  });

  it("DOMAIN SEPARATION: a counter-seal is not a valid self-seal, and vice versa", () => {
    const { sofer, record } = setup();
    const seal = counterSealReshumah(record, sofer, "sofer", at);
    // The counter-seal signature must NOT verify as an untagged self-seal over any object…
    const { chotam: _c, ...unsealed } = record;
    void _c;
    expect(verifyObject(unsealed, sofer.publicJwk, seal.sig)).toBe(false);
    // …and the record's own self-seal must NOT verify as a counter-seal preimage.
    expect(
      verifyTagged(COUNTERSEAL_TYP, { sealSig: record.chotam.sig, subjectKid: record.publicKey.kid, role: "sofer", signedAt: at }, record.publicKey.jwk, record.chotam.sig),
    ).toBe(false);
  });

  it("appendCounterSeal is additive — the self-seal still verifies afterward", () => {
    const { sofer, record } = setup();
    const seal = counterSealReshumah(record, sofer, "sofer", at);
    const vouched = appendCounterSeal(record, seal);
    expect(verifyReshumah(vouched).ok).toBe(true);
    expect(vouched.chotam.counterSeals).toHaveLength(1);
  });
});

describe("computeEffectiveLevel / verifyReshumah elevation", () => {
  function vouchedRecord() {
    const { subject, sofer, record } = setup();
    const seal = counterSealReshumah(record, sofer, "sofer", at);
    return { subject, sofer, record: appendCounterSeal(record, seal) };
  }

  it("stays self with no trusted issuers", () => {
    const { record } = vouchedRecord();
    expect(verifyReshumah(record).effectiveLevel).toBe("self");
  });

  it("elevates to vouched when the issuer is trusted", () => {
    const { sofer, record } = vouchedRecord();
    const issuers: TrustedIssuer[] = [{ kid: sofer.kid, jwk: sofer.publicJwk, grants: "vouched" }];
    const outcome = verifyReshumah(record, { trustedIssuers: issuers, now: new Date(at) });
    expect(outcome.ok).toBe(true);
    expect(outcome.effectiveLevel).toBe("vouched");
    expect(outcome.level).toBe("vouched");
    expect(outcome.recognizedSeals[0]?.kid).toBe(sofer.kid);
  });

  it("ignores a seal from an untrusted issuer (no error, stays self)", () => {
    const { record } = vouchedRecord();
    const stranger = generateShaliachKeypair();
    const outcome = verifyReshumah(record, {
      trustedIssuers: [{ kid: stranger.kid, jwk: stranger.publicJwk, grants: "verified" }],
      now: new Date(at),
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.effectiveLevel).toBe("self");
  });

  it("derives the grant from the CALLER's entry, not the seal's role", () => {
    const { subject, sofer, record } = setup();
    // Seal claims role "verified" …
    const seal = counterSealReshumah(record, sofer, "verified", at);
    const vouched = appendCounterSeal(record, seal);
    void subject;
    // …but the caller only grants "vouched" to this issuer.
    const outcome = verifyReshumah(vouched, {
      trustedIssuers: [{ kid: sofer.kid, jwk: sofer.publicJwk, grants: "vouched" }],
      now: new Date(at),
    });
    expect(outcome.effectiveLevel).toBe("vouched"); // not "verified"
  });

  it("takes the highest grant among multiple recognized seals", () => {
    const { sofer, record } = setup();
    const ca = generateShaliachKeypair();
    let r = appendCounterSeal(record, counterSealReshumah(record, sofer, "sofer", at));
    r = appendCounterSeal(r, counterSealReshumah(record, ca, "ca", at));
    const outcome = verifyReshumah(r, {
      trustedIssuers: [
        { kid: sofer.kid, jwk: sofer.publicJwk, grants: "vouched" },
        { kid: ca.kid, jwk: ca.publicJwk, grants: "verified" },
      ],
      now: new Date(at),
    });
    expect(outcome.effectiveLevel).toBe("verified");
    expect(outcome.recognizedSeals).toHaveLength(2);
  });

  it("a tampered body breaks the self-seal even with a valid counter-seal", () => {
    const { sofer, record } = vouchedRecord();
    const tampered = { ...record, shaliach: { ...record.shaliach, version: "9.9.9" } };
    const outcome = verifyReshumah(tampered, {
      trustedIssuers: [{ kid: sofer.kid, jwk: sofer.publicJwk, grants: "vouched" }],
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.effectiveLevel).toBe("invalid");
  });

  it("computeEffectiveLevel directly: empty issuers → self", () => {
    const { record } = vouchedRecord();
    expect(computeEffectiveLevel(record, [], new Date(at)).level).toBe("self");
  });
});

describe("counter-seal freshness", () => {
  it("an expired record grants no level, even with a valid trusted counter-seal", () => {
    const { sofer, record } = setup();
    const vouched = appendCounterSeal(record, counterSealReshumah(record, sofer, "sofer", at));
    const issuers: TrustedIssuer[] = [{ kid: sofer.kid, jwk: sofer.publicJwk, grants: "vouched" }];
    // Record TTL is 300s from `at`; evaluate an hour later → expired → suppressed to self.
    const outcome = verifyReshumah(vouched, { trustedIssuers: issuers, now: new Date("2026-06-09T01:00:00.000Z") });
    expect(outcome.ok).toBe(true);
    expect(outcome.expired).toBe(true);
    expect(outcome.effectiveLevel).toBe("self");
  });

  it("ignores a post-dated counter-seal", () => {
    const { sofer, record } = setup();
    const future = "2026-06-09T02:00:00.000Z";
    const vouched = appendCounterSeal(record, counterSealReshumah(record, sofer, "sofer", future));
    const issuers: TrustedIssuer[] = [{ kid: sofer.kid, jwk: sofer.publicJwk, grants: "vouched" }];
    // Evaluate at `at` (00:00), before the seal's signedAt (02:00) → seal ignored.
    expect(verifyReshumah(vouched, { trustedIssuers: issuers, now: new Date(at) }).effectiveLevel).toBe("self");
  });
});

describe("counter-seal bound (DoS guard)", () => {
  it(`rejects a record carrying more than ${MAX_COUNTER_SEALS} counter-seals`, () => {
    const { sofer, record } = setup();
    const fake: CounterSeal = { kid: sofer.kid, sig: "AAAA", role: "sofer", signedAt: at };
    const flooded = {
      ...record,
      chotam: { ...record.chotam, counterSeals: Array.from({ length: MAX_COUNTER_SEALS + 1 }, () => fake) },
    };
    expect(ReshumaSchema.safeParse(flooded).success).toBe(false);
  });
});

describe("version forward-compatibility (PROTOCOL §6)", () => {
  it("accepts any sefer/0.x and rejects other version strings", () => {
    const { record } = setup();
    expect(ReshumaSchema.safeParse({ ...record, v: "sefer/0.3" }).success).toBe(true);
    expect(ReshumaSchema.safeParse({ ...record, v: "sefer/0.99" }).success).toBe(true);
    expect(ReshumaSchema.safeParse({ ...record, v: "sefer/1.0" }).success).toBe(false);
    expect(ReshumaSchema.safeParse({ ...record, v: "nope" }).success).toBe(false);
  });
});
