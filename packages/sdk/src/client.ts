import {
  createReshumah,
  parseShem,
  serializeShem,
  verifyReshumah,
  type CreateReshumaParams,
  type Reshuma,
  type ShaliachKeypair,
  type TrustedIssuer,
  type VerifyOutcome,
  type VerifyParams,
} from "@sefer/core";
import { SeferHttpError, SeferVerificationError } from "./errors";

export type FetchLike = typeof globalThis.fetch;

export interface SeferOptions {
  /** Base URL of the Sofer to talk to, e.g. "https://sofer.acme.dev". */
  sofer: string;
  /** Override fetch (defaults to global fetch). */
  fetch?: FetchLike;
  /** Clock injection for deterministic tests. */
  now?: () => Date;
  /** Enable the TTL-aware resolve cache (default true). */
  cache?: boolean;
  /**
   * Issuers this client trusts to vouch for records. When set, resolve()/discover()
   * report `effectiveLevel` of "vouched"/"verified" for records with recognized
   * counter-seals; otherwise everything is reported at "self".
   */
  trust?: { issuers?: TrustedIssuer[] };
}

export interface InscribeResponse {
  ok: boolean;
  shem?: string;
  level?: string;
  code?: string;
  error?: string;
}

export interface ResolvedReshuma {
  record: Reshuma;
  verify: VerifyOutcome;
}

export interface DiscoverQuery {
  intent?: string;
  parashah?: string;
  capability?: string;
  protocol?: string;
  tags?: string[];
  limit?: number;
}

export interface DiscoverResult {
  record: Reshuma;
  score: number;
  matchedCapabilities: string[];
  verify: VerifyOutcome;
}

export interface HeartbeatHandle {
  stop(): void;
}

interface CacheEntry {
  resolved: ResolvedReshuma;
  expiresAtMs: number;
}

/** Normalize a shem to its identity key (parashah + name; drop version/capability). */
function identityKey(shem: string): string {
  const parsed = parseShem(shem);
  return serializeShem({ parashah: parsed.parashah, name: parsed.name });
}

/**
 * The Sefer client. Talks to a Sofer over HTTP, but **never trusts it**: every resolved
 * or discovered record is re-verified locally against its own chotam before being
 * returned. Resolve results are cached for their TTL.
 */
export class Sefer {
  private readonly base: string;
  private readonly fetchImpl: FetchLike;
  private readonly cacheEnabled: boolean;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly options: SeferOptions) {
    this.base = options.sofer.replace(/\/+$/, "");
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.cacheEnabled = options.cache ?? true;
  }

  private now(): Date {
    return this.options.now ? this.options.now() : new Date();
  }

  private verifyParams(): VerifyParams {
    const issuers = this.options.trust?.issuers;
    return { now: this.now(), ...(issuers && issuers.length > 0 ? { trustedIssuers: issuers } : {}) };
  }

  /** Build, self-seal, and inscribe a reshumah for this shaliach. */
  async inscribe(
    params: CreateReshumaParams,
    keypair: ShaliachKeypair,
  ): Promise<{ record: Reshuma; response: InscribeResponse }> {
    const record = createReshumah(params, keypair, this.now());
    const res = await this.fetchImpl(`${this.base}/v1/inscribe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(record),
    });
    const text = await res.text();
    if (!res.ok) throw new SeferHttpError(res.status, text);
    return { record, response: JSON.parse(text) as InscribeResponse };
  }

  /** Resolve a shem, verifying the record locally. Returns null if not found. */
  async resolve(shem: string): Promise<ResolvedReshuma | null> {
    const key = identityKey(shem);
    if (this.cacheEnabled) {
      const cached = this.cache.get(key);
      if (cached && cached.expiresAtMs > this.now().getTime()) return cached.resolved;
    }

    const res = await this.fetchImpl(`${this.base}/v1/resolve?shem=${encodeURIComponent(shem)}`);
    if (res.status === 404) return null;
    const text = await res.text();
    if (!res.ok) throw new SeferHttpError(res.status, text);

    const record = JSON.parse(text) as Reshuma;
    const verify = verifyReshumah(record, this.verifyParams());
    if (!verify.ok) throw new SeferVerificationError(shem, verify.reasons);

    const resolved: ResolvedReshuma = { record, verify };
    if (this.cacheEnabled) {
      this.cache.set(key, {
        resolved,
        expiresAtMs: this.now().getTime() + record.meta.ttl * 1000,
      });
    }
    return resolved;
  }

  /** Discover agents by intent/parashah/capability/protocol/tags. Invalid records are dropped. */
  async discover(query: DiscoverQuery): Promise<DiscoverResult[]> {
    const params = new URLSearchParams();
    if (query.intent) params.set("intent", query.intent);
    if (query.parashah) params.set("parashah", query.parashah);
    if (query.capability) params.set("capability", query.capability);
    if (query.protocol) params.set("protocol", query.protocol);
    if (query.tags && query.tags.length > 0) params.set("tags", query.tags.join(","));
    if (query.limit !== undefined) params.set("limit", String(query.limit));

    const res = await this.fetchImpl(`${this.base}/v1/discover?${params.toString()}`);
    const text = await res.text();
    if (!res.ok) throw new SeferHttpError(res.status, text);

    const body = JSON.parse(text) as {
      results: Array<{ record: Reshuma; score: number; matchedCapabilities: string[] }>;
    };

    const out: DiscoverResult[] = [];
    for (const hit of body.results) {
      const verify = verifyReshumah(hit.record, this.verifyParams());
      if (verify.ok) {
        out.push({ record: hit.record, score: hit.score, matchedCapabilities: hit.matchedCapabilities, verify });
      }
    }
    return out;
  }

  /** Clear the resolve cache. */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Keep a record fresh by re-inscribing on an interval (a liveness heartbeat). Inscribes
   * once immediately, then every `intervalMs`. Call `stop()` to end it.
   */
  heartbeat(
    params: CreateReshumaParams,
    keypair: ShaliachKeypair,
    opts: { intervalMs: number; onError?: (err: unknown) => void },
  ): HeartbeatHandle {
    const tick = (): void => {
      this.inscribe(params, keypair).catch((err) => opts.onError?.(err));
    };
    tick();
    const timer = setInterval(tick, opts.intervalMs);
    return {
      stop: () => clearInterval(timer),
    };
  }
}
