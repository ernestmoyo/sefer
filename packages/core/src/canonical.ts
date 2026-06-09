import { CanonicalError } from "./errors";

/**
 * Sefer Canonical JSON (SCJ) — a JCS-compatible (RFC 8785) subset sufficient for
 * Sefer's value types. Byte-stable output is what makes the chotam seal verifiable.
 * See docs/PROTOCOL.md §5.
 *
 * Rules: object keys sorted by code point; no insignificant whitespace; `undefined`
 * keys omitted; finite numbers only; arrays keep order.
 */
export function canonicalize(value: unknown): string {
  return serialize(value);
}

const encoder = new TextEncoder();

/** UTF-8 bytes of the canonical form — the exact input to sign/verify. */
export function canonicalBytes(value: unknown): Uint8Array {
  return encoder.encode(canonicalize(value));
}

function serialize(value: unknown): string {
  if (value === null) return "null";

  const type = typeof value;

  if (type === "string") return JSON.stringify(value);
  if (type === "boolean") return value ? "true" : "false";
  if (type === "number") {
    if (!Number.isFinite(value)) {
      throw new CanonicalError("non-finite numbers cannot be canonicalized");
    }
    return JSON.stringify(value);
  }
  if (type === "bigint") {
    throw new CanonicalError("bigint is not supported in canonical JSON");
  }
  if (type === "undefined") {
    // Top-level undefined is meaningless; inside objects it is filtered before recursion.
    throw new CanonicalError("undefined cannot be canonicalized");
  }

  if (Array.isArray(value)) {
    return "[" + value.map((item) => serialize(item ?? null)).join(",") + "]";
  }

  if (type === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((key) => obj[key] !== undefined)
      .sort();
    return (
      "{" +
      keys
        .map((key) => JSON.stringify(key) + ":" + serialize(obj[key]))
        .join(",") +
      "}"
    );
  }

  throw new CanonicalError(`unsupported value type: ${type}`);
}
