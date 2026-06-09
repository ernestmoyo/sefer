import {
  appendCounterSeal,
  counterSealReshumah,
  parseShem,
  verifyCounterSeal,
  verifyReshumah,
  type Reshuma,
  type ShaliachKeypair,
} from "@sefer/core";
import { storeKey, type ReshumaStore } from "./store";
import { openAuthorizer, type Authorizer } from "./authz";
import type { AuditLog } from "./audit";
import { runDiscover, type DiscoverHit, type DiscoverQuery } from "./discover";

export interface SoferOptions {
  /** Inscription policy. Defaults to {@link openAuthorizer}. */
  authorizer?: Authorizer;
  /** Optional tamper-evident audit log. */
  audit?: AuditLog;
  /** Clock injection for deterministic tests. */
  now?: () => Date;
  /**
   * This Sofer's own identity, used to counter-seal (vouch for) records. The `role` is
   * advisory; callers decide what a seal from this key grants. See docs/ARCHITECTURE.md §4.
   */
  signer?: { keypair: ShaliachKeypair; role: string };
  /** When true (and a signer is set), every accepted record is auto-vouched on inscribe. */
  autoVouch?: boolean;
}

export interface InscribeResult {
  ok: boolean;
  shem?: string;
  level?: string;
  /** Machine-readable failure code when `ok` is false. */
  code?: string;
  error?: string;
}

/**
 * A Sofer (scribe) — the registry orchestrator. It validates and seals-checks incoming
 * records, enforces the TOFU key-binding invariant and the configured authorizer, stores
 * accepted records, appends to the audit log, and serves resolve/discover queries.
 *
 * A Sofer is NOT trusted for record integrity — callers re-verify the chotam locally.
 * It is trusted only for availability and for its own (optional) counter-seals.
 */
export class Sofer {
  constructor(
    private readonly store: ReshumaStore,
    private readonly options: SoferOptions = {},
  ) {}

  private now(): Date {
    return this.options.now ? this.options.now() : new Date();
  }

  /** Inscribe (or update) a record. Returns a result object rather than throwing. */
  async inscribe(record: unknown): Promise<InscribeResult> {
    const verdict = verifyReshumah(record, this.now());
    if (!verdict.ok) {
      return { ok: false, code: "ERR_INVALID_RESHUMA", error: verdict.reasons.join("; ") };
    }
    const incoming = record as Reshuma;
    const key = storeKey(incoming.shaliach.parashah, incoming.shaliach.name);
    const existing = await this.store.get(key);

    // Always-on TOFU: a shem, once bound to a key, can only be updated by that key.
    if (existing && existing.publicKey.kid !== incoming.publicKey.kid) {
      return {
        ok: false,
        code: "ERR_NAME_BOUND",
        error: "shem is already bound to a different key (trust-on-first-use)",
      };
    }

    const authorizer = this.options.authorizer ?? openAuthorizer;
    const decision = await authorizer.authorize({ record: incoming, existing });
    if (!decision.allowed) {
      return { ok: false, code: "ERR_UNAUTHORIZED", error: decision.reason ?? "unauthorized" };
    }

    await this.store.put(incoming);
    if (this.options.audit) {
      await this.options.audit.append({
        action: existing ? "update" : "inscribe",
        shem: incoming.shem,
        kid: incoming.publicKey.kid,
        record: incoming,
        ts: this.now().toISOString(),
      });
    }

    if (this.options.signer && this.options.autoVouch) {
      await this.vouch(incoming);
    }

    return { ok: true, shem: incoming.shem, level: verdict.level };
  }

  /**
   * Counter-seal (vouch for) an already-inscribed record with this Sofer's own key. The
   * seal is appended additively (the self-seal is untouched) and re-stored. Idempotent:
   * a second vouch by the same key is a no-op.
   */
  async counterSeal(shem: string): Promise<{ ok: boolean; error?: string }> {
    if (!this.options.signer) return { ok: false, error: "this Sofer has no signer configured" };
    const record = await this.resolve(shem);
    if (!record) return { ok: false, error: "no such shem" };
    await this.vouch(record);
    return { ok: true };
  }

  private async vouch(record: Reshuma): Promise<void> {
    const signer = this.options.signer;
    if (!signer) return;
    // Idempotency guard must require a *valid* existing seal from our own key. A kid-only
    // check is exploitable: a hostile submitter can pre-inject a garbage counter-seal
    // bearing our kid (counter-seals live outside the signed body) to suppress our vouch
    // forever (denial-of-vouch). Verifying defeats that — a forged seal won't verify.
    const alreadyVouched = (record.chotam.counterSeals ?? []).some(
      (s) => s.kid === signer.keypair.kid && verifyCounterSeal(record, s, signer.keypair.publicJwk),
    );
    if (alreadyVouched) return;

    const seal = counterSealReshumah(record, signer.keypair, signer.role, this.now().toISOString());
    const vouched = appendCounterSeal(record, seal);
    await this.store.put(vouched);
    if (this.options.audit) {
      await this.options.audit.append({
        action: "vouch",
        shem: vouched.shem,
        kid: signer.keypair.kid,
        record: vouched,
        ts: this.now().toISOString(),
      });
    }
  }

  /** Resolve a shem to its record (by parashah + name; version/capability selectors ignored in v0.1). */
  async resolve(shem: string): Promise<Reshuma | null> {
    const parsed = parseShem(shem);
    return this.store.get(storeKey(parsed.parashah, parsed.name));
  }

  /** Discover records by intent / parashah / capability / protocol / tags. */
  async discover(query: DiscoverQuery): Promise<DiscoverHit[]> {
    return runDiscover(await this.store.all(), query);
  }
}
