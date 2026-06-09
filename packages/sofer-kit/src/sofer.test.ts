import { describe, it, expect } from "vitest";
import { generateShaliachKeypair } from "@sefer/core";
import { Sofer } from "./sofer";
import { InMemoryReshumaStore } from "./memory-store";
import { InMemoryAuditLog } from "./audit";
import { AllowlistAuthorizer } from "./authz";
import { mintReshumah } from "./testkit";

const now = () => new Date("2026-06-09T00:00:00.000Z");

function freshSofer(opts?: ConstructorParameters<typeof Sofer>[1]) {
  const store = new InMemoryReshumaStore();
  return { store, sofer: new Sofer(store, { now, ...opts }) };
}

describe("Sofer.inscribe", () => {
  it("accepts a valid record and audits it", async () => {
    const audit = new InMemoryAuditLog();
    const { sofer, store } = freshSofer({ audit });
    const { record } = mintReshumah();

    const result = await sofer.inscribe(record);
    expect(result.ok).toBe(true);
    expect(result.shem).toBe("shem://acme.maps.geocoder");
    expect(result.level).toBe("self");
    expect(store.size).toBe(1);

    const entries = await audit.entries();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.action).toBe("inscribe");
    expect(await audit.verifyChain()).toEqual({ ok: true });
  });

  it("rejects a tampered (invalid-seal) record", async () => {
    const { sofer } = freshSofer();
    const { record } = mintReshumah();
    const tampered = { ...record, shaliach: { ...record.shaliach, version: "9.9.9" } };
    const result = await sofer.inscribe(tampered);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("ERR_INVALID_RESHUMA");
  });

  it("enforces TOFU: a different key cannot take over a claimed shem", async () => {
    const { sofer } = freshSofer();
    const first = mintReshumah({ shem: "shem://acme.maps.geocoder" });
    await sofer.inscribe(first.record);

    const impostor = mintReshumah({ shem: "shem://acme.maps.geocoder", keypair: generateShaliachKeypair() });
    const result = await sofer.inscribe(impostor.record);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("ERR_NAME_BOUND");
  });

  it("allows the original key to update its own record", async () => {
    const { sofer, store } = freshSofer();
    const { keypair } = mintReshumah({ version: "1.0.0" });
    await sofer.inscribe(mintReshumah({ keypair, version: "1.0.0" }).record);
    const updated = mintReshumah({ keypair, version: "1.1.0" });
    const result = await sofer.inscribe(updated.record);
    expect(result.ok).toBe(true);
    expect(store.size).toBe(1);
    expect((await sofer.resolve("shem://acme.maps.geocoder"))?.shaliach.version).toBe("1.1.0");
  });

  it("applies the authorizer", async () => {
    const { record } = mintReshumah({ shem: "shem://acme.maps.geocoder" });
    const denying = new AllowlistAuthorizer({ acme: ["u-not-this-key"] });
    const { sofer } = freshSofer({ authorizer: denying });
    const result = await sofer.inscribe(record);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("ERR_UNAUTHORIZED");
  });
});

describe("Sofer.resolve / discover", () => {
  it("resolves a hit and misses cleanly", async () => {
    const { sofer } = freshSofer();
    await sofer.inscribe(mintReshumah().record);
    expect((await sofer.resolve("shem://acme.maps.geocoder"))?.shem).toBe("shem://acme.maps.geocoder");
    expect(await sofer.resolve("shem://acme.maps.missing")).toBeNull();
  });

  it("discovers by intent", async () => {
    const { sofer } = freshSofer();
    await sofer.inscribe(mintReshumah().record);
    const hits = await sofer.discover({ intent: "convert address to latitude longitude" });
    expect(hits[0]?.record.shaliach.name).toBe("geocoder");
  });
});
