import type { Reshuma } from "@sefer/core";

/**
 * A discovery query. Hard filters (parashah, capability, protocol, tags) constrain the
 * candidate set; `intent` then ranks survivors by lexical relevance. Semantic (embedding)
 * ranking arrives in Phase 2 — the API is shaped to accept it without changing callers.
 * See docs/PROTOCOL.md §3 and docs/ARCHITECTURE.md §7.
 */
export interface DiscoverQuery {
  /** Natural-language intent, ranked lexically against capability text. */
  intent?: string;
  /** Parashah prefix (dotted), matched on label boundaries, e.g. "acme" matches "acme.maps". */
  parashah?: string;
  /** Require a capability with this exact id. */
  capability?: string;
  /** Require an endpoint speaking this protocol. */
  protocol?: string;
  /** Require at least one of these tags among the record's capabilities. */
  tags?: string[];
  /** Max results (default 20). */
  limit?: number;
}

export interface DiscoverHit {
  readonly record: Reshuma;
  readonly score: number;
  readonly matchedCapabilities: string[];
}

const STOPWORDS = new Set([
  "a", "an", "the", "to", "of", "and", "or", "for", "into", "from", "with", "on", "in", "by", "is",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
}

/** True if `prefix` matches `parashah` on a label boundary (prefix "" matches everything). */
function parashahMatches(parashah: readonly string[], prefix: string): boolean {
  if (prefix === "") return true;
  const want = prefix.split(".");
  if (want.length > parashah.length) return false;
  return want.every((label, i) => parashah[i] === label);
}

/** Score one record against a query; returns null if it fails a hard filter. */
export function scoreRecord(record: Reshuma, query: DiscoverQuery): DiscoverHit | null {
  if (!parashahMatches(record.shaliach.parashah, query.parashah ?? "")) return null;

  if (query.protocol && !record.endpoints.some((e) => e.protocol === query.protocol)) {
    return null;
  }

  let candidates = record.capabilities;
  if (query.capability) {
    candidates = candidates.filter((c) => c.id === query.capability);
    if (candidates.length === 0) return null;
  }
  if (query.tags && query.tags.length > 0) {
    const want = new Set(query.tags.map((t) => t.toLowerCase()));
    candidates = candidates.filter((c) => (c.tags ?? []).some((t) => want.has(t.toLowerCase())));
    if (candidates.length === 0) return null;
  }

  const matched: string[] = [];
  let score = 1; // passed all hard filters

  if (query.intent && query.intent.trim().length > 0) {
    const queryTokens = new Set(tokenize(query.intent));
    for (const cap of candidates) {
      const haystack = tokenize(
        [cap.id, cap.title ?? "", cap.description ?? "", cap.intent ?? "", (cap.tags ?? []).join(" ")].join(" "),
      );
      const overlap = haystack.filter((t) => queryTokens.has(t)).length;
      if (overlap > 0) {
        score += overlap / Math.max(queryTokens.size, 1);
        matched.push(cap.id);
      }
    }
  } else {
    for (const cap of candidates) matched.push(cap.id);
  }

  return { record, score, matchedCapabilities: matched };
}

/** Run a discovery query over a candidate set, ranked best-first. */
export function runDiscover(records: readonly Reshuma[], query: DiscoverQuery): DiscoverHit[] {
  const hits: DiscoverHit[] = [];
  for (const record of records) {
    const hit = scoreRecord(record, query);
    if (hit) hits.push(hit);
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, query.limit ?? 20);
}
