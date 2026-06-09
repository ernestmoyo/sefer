import type { Reshuma } from "@sefer/core";

/**
 * Authorization decides whether a (self-verified) record may be inscribed into its
 * parashah. It is separate from the always-on TOFU key-binding invariant the Sofer
 * enforces directly (a shem, once claimed by a key, can only be updated by that key).
 * See docs/ARCHITECTURE.md §4.
 */
export interface AuthContext {
  /** The incoming record — already structurally + cryptographically verified. */
  readonly record: Reshuma;
  /** The record currently at this shem, if any. */
  readonly existing: Reshuma | null;
}

export interface AuthResult {
  readonly allowed: boolean;
  readonly reason?: string;
}

export interface Authorizer {
  authorize(ctx: AuthContext): AuthResult | Promise<AuthResult>;
}

/**
 * Permissive authorizer — anyone may inscribe anywhere. The sensible default for a
 * single-org or development Sofer (TOFU still prevents name hijacking). Do NOT use for
 * an open, multi-tenant Sofer; pair with {@link AllowlistAuthorizer} or your own policy.
 */
export const openAuthorizer: Authorizer = {
  authorize: () => ({ allowed: true }),
};

/**
 * Allowlist policy: each parashah (dotted string) maps to the set of key ids permitted
 * to inscribe at or beneath it. The root parashah (empty string) is open by design and
 * should never be trusted. A longer (more specific) matching parashah prefix wins.
 */
export class AllowlistAuthorizer implements Authorizer {
  private readonly rules: Map<string, ReadonlySet<string>>;

  constructor(rules: Record<string, readonly string[]>) {
    this.rules = new Map(
      Object.entries(rules).map(([parashah, kids]) => [parashah, new Set(kids)]),
    );
  }

  authorize(ctx: AuthContext): AuthResult {
    const parashah = ctx.record.shaliach.parashah.join(".");
    if (parashah === "") return { allowed: true }; // root is open (and untrusted)

    // Find the longest configured prefix that governs this parashah.
    const labels = ctx.record.shaliach.parashah;
    for (let depth = labels.length; depth >= 1; depth--) {
      const prefix = labels.slice(0, depth).join(".");
      const allowed = this.rules.get(prefix);
      if (allowed) {
        return allowed.has(ctx.record.publicKey.kid)
          ? { allowed: true }
          : { allowed: false, reason: `key ${ctx.record.publicKey.kid} not allowed in parashah "${prefix}"` };
      }
    }
    return { allowed: false, reason: `no inscription policy for parashah "${parashah}"` };
  }
}
