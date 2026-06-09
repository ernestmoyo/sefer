import { describe, it, expect } from "vitest";
import { generateShaliachKeypair, verifyReshumah, type CounterSeal, type TrustedIssuer } from "@sefer/core";
import { Sofer } from "./sofer";
import { InMemoryReshumaStore } from "./memory-store";
import { InMemoryAuditLog } from "./audit";
import { mintReshumah } from "./testkit";

const now = () => new Date("2026-06-09T00:00:00.000Z");
// A clock inside the minted record's validity window (mint at 00:00, ttl 300s → expires 00:05).
const vnow = new Date("2026-06-09T00:01:00.000Z");
const soferKeypair = generateShaliachKeypair();

function soferWithSigner(autoVouch = false) {
  const store = new InMemoryReshumaStore();
  const audit = new InMemoryAuditLog();
  const sofer = new Sofer(store, {
    now,
    audit,
    signer: { keypair: soferKeypair, role: "sofer" },
    autoVouch,
  });
  return { store, audit, sofer };
}

const trustThisSofer: TrustedIssuer[] = [
  { kid: soferKeypair.kid, jwk: soferKeypair.publicJwk, grants: "vouched" },
];

describe("Sofer counter-sealing", () => {
  it("counter-seals on demand and elevates the record to vouched for a trusting caller", async () => {
    const { sofer, audit } = soferWithSigner();
    const { record } = mintReshumah();
    await sofer.inscribe(record);

    const result = await sofer.counterSeal("shem://acme.maps.geocoder");
    expect(result.ok).toBe(true);

    const stored = await sofer.resolve("shem://acme.maps.geocoder");
    expect(stored).not.toBeNull();
    expect(stored!.chotam.counterSeals).toHaveLength(1);

    // A caller who trusts this Sofer now sees "vouched"; the self-seal still verifies.
    const outcome = verifyReshumah(stored!, { trustedIssuers: trustThisSofer, now: vnow });
    expect(outcome.ok).toBe(true);
    expect(outcome.effectiveLevel).toBe("vouched");

    // A caller who does NOT trust this Sofer still sees only "self".
    expect(verifyReshumah(stored!, { now: vnow }).effectiveLevel).toBe("self");

    const actions = (await audit.entries()).map((e) => e.action);
    expect(actions).toEqual(["inscribe", "vouch"]);
    expect(await audit.verifyChain()).toEqual({ ok: true });
  });

  it("auto-vouches on inscribe when configured", async () => {
    const { sofer } = soferWithSigner(true);
    await sofer.inscribe(mintReshumah().record);
    const stored = await sofer.resolve("shem://acme.maps.geocoder");
    expect(stored).not.toBeNull();
    expect(verifyReshumah(stored!, { trustedIssuers: trustThisSofer, now: vnow }).effectiveLevel).toBe("vouched");
  });

  it("is idempotent — a second vouch by the same key adds no seal", async () => {
    const { sofer } = soferWithSigner();
    await sofer.inscribe(mintReshumah().record);
    await sofer.counterSeal("shem://acme.maps.geocoder");
    await sofer.counterSeal("shem://acme.maps.geocoder");
    const stored = await sofer.resolve("shem://acme.maps.geocoder");
    expect(stored?.chotam.counterSeals).toHaveLength(1);
  });

  it("refuses to counter-seal without a signer, or for an unknown shem", async () => {
    const bare = new Sofer(new InMemoryReshumaStore(), { now });
    expect((await bare.counterSeal("shem://x.y")).ok).toBe(false);

    const { sofer } = soferWithSigner();
    expect((await sofer.counterSeal("shem://acme.maps.ghost")).ok).toBe(false);
  });

  it("resists denial-of-vouch: a forged seal bearing the Sofer's kid cannot block a real vouch", async () => {
    const { sofer } = soferWithSigner();
    const { record } = mintReshumah();
    // Attacker pre-injects a garbage counter-seal carrying the Sofer's kid (counter-seals
    // live outside the signed body, so the self-seal still verifies and inscribe accepts it).
    const forged: CounterSeal = { kid: soferKeypair.kid, sig: "AAAA", role: "sofer", signedAt: "2026-06-09T00:00:00.000Z" };
    const poisoned = { ...record, chotam: { ...record.chotam, counterSeals: [forged] } };
    expect((await sofer.inscribe(poisoned)).ok).toBe(true);

    await sofer.counterSeal("shem://acme.maps.geocoder");
    const stored = await sofer.resolve("shem://acme.maps.geocoder");
    expect(stored).not.toBeNull();
    // The guard wasn't fooled: a genuine, verifying seal was added alongside the forgery…
    expect(stored!.chotam.counterSeals).toHaveLength(2);
    // …and a trusting caller is correctly elevated to vouched (the forgery is ignored).
    expect(verifyReshumah(stored!, { trustedIssuers: trustThisSofer, now: vnow }).effectiveLevel).toBe("vouched");
  });
});
