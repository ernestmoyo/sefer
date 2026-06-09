import { createHash } from "node:crypto";
import { canonicalize, type Reshuma } from "@sefer/core";

/**
 * A tamper-evident, hash-chained audit log. Every inscription is appended; each entry
 * commits to the previous entry's hash, so any retroactive edit breaks the chain and is
 * detectable. This is a local transparency aid, not a global ledger (see ARCHITECTURE §8).
 */
export type AuditAction = "inscribe" | "update" | "tombstone" | "vouch";

export interface AuditEntry {
  readonly seq: number;
  readonly ts: string;
  readonly action: AuditAction;
  readonly shem: string;
  readonly kid: string;
  /** sha256 of the canonical record (hex). */
  readonly recordHash: string;
  /** entryHash of the previous entry, or "" for the genesis entry. */
  readonly prevHash: string;
  /** sha256 over the canonical entry header (hex) — the chain link. */
  readonly entryHash: string;
}

export interface AppendInput {
  action: AuditAction;
  shem: string;
  kid: string;
  record: Reshuma;
  ts: string;
}

export interface AuditLog {
  append(input: AppendInput): Promise<AuditEntry>;
  entries(): Promise<readonly AuditEntry[]>;
  /** The current chain head (last entryHash, or "" if empty). */
  head(): Promise<string>;
  /** Recompute every link; report the first seq where the chain is broken, if any. */
  verifyChain(): Promise<{ ok: boolean; brokenAt?: number }>;
}

function sha256hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Compute the chain link hash for an entry's header (everything except entryHash). */
export function computeEntryHash(header: Omit<AuditEntry, "entryHash">): string {
  return sha256hex(
    canonicalize({
      seq: header.seq,
      ts: header.ts,
      action: header.action,
      shem: header.shem,
      kid: header.kid,
      recordHash: header.recordHash,
      prevHash: header.prevHash,
    }),
  );
}

export class InMemoryAuditLog implements AuditLog {
  private readonly log: AuditEntry[] = [];

  async append(input: AppendInput): Promise<AuditEntry> {
    const seq = this.log.length;
    const prevHash = seq === 0 ? "" : (this.log[seq - 1] as AuditEntry).entryHash;
    const recordHash = sha256hex(canonicalize(input.record));
    const header: Omit<AuditEntry, "entryHash"> = {
      seq,
      ts: input.ts,
      action: input.action,
      shem: input.shem,
      kid: input.kid,
      recordHash,
      prevHash,
    };
    const entry: AuditEntry = { ...header, entryHash: computeEntryHash(header) };
    this.log.push(entry);
    return entry;
  }

  async entries(): Promise<readonly AuditEntry[]> {
    return [...this.log];
  }

  async head(): Promise<string> {
    return this.log.length === 0 ? "" : (this.log[this.log.length - 1] as AuditEntry).entryHash;
  }

  async verifyChain(): Promise<{ ok: boolean; brokenAt?: number }> {
    let prev = "";
    for (const entry of this.log) {
      const { entryHash, ...header } = entry;
      if (header.prevHash !== prev || computeEntryHash(header) !== entryHash) {
        return { ok: false, brokenAt: entry.seq };
      }
      prev = entryHash;
    }
    return { ok: true };
  }
}
