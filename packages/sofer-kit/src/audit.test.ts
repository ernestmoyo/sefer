import { describe, it, expect } from "vitest";
import { InMemoryAuditLog } from "./audit";
import { mintReshumah } from "./testkit";

const ts = "2026-06-09T00:00:00.000Z";

describe("InMemoryAuditLog", () => {
  it("chains entries and verifies the chain", async () => {
    const log = new InMemoryAuditLog();
    const { record } = mintReshumah();

    const a = await log.append({ action: "inscribe", shem: record.shem, kid: record.publicKey.kid, record, ts });
    const b = await log.append({ action: "update", shem: record.shem, kid: record.publicKey.kid, record, ts });

    expect(a.seq).toBe(0);
    expect(a.prevHash).toBe("");
    expect(b.seq).toBe(1);
    expect(b.prevHash).toBe(a.entryHash);
    expect(await log.head()).toBe(b.entryHash);

    expect(await log.verifyChain()).toEqual({ ok: true });
  });

  it("empty log has an empty head and verifies", async () => {
    const log = new InMemoryAuditLog();
    expect(await log.head()).toBe("");
    expect(await log.verifyChain()).toEqual({ ok: true });
  });

  it("detects a tampered entry", async () => {
    const log = new InMemoryAuditLog();
    const { record } = mintReshumah();
    await log.append({ action: "inscribe", shem: record.shem, kid: record.publicKey.kid, record, ts });
    await log.append({ action: "update", shem: record.shem, kid: record.publicKey.kid, record, ts });

    // Reach in and corrupt the first entry's shem (simulating a retroactive edit).
    const entries = (await log.entries()) as unknown as Array<{ shem: string }>;
    entries[0]!.shem = "shem://evil.takeover";

    const result = await log.verifyChain();
    expect(result.ok).toBe(false);
    expect(result.brokenAt).toBe(0);
  });
});
