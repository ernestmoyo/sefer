import { describe, it, expect } from "vitest";
import { canonicalize, canonicalBytes } from "./canonical";
import { CanonicalError } from "./errors";

describe("canonicalize", () => {
  it("sorts object keys by code point", () => {
    expect(canonicalize({ b: 1, a: 2, c: 3 })).toBe('{"a":2,"b":1,"c":3}');
  });

  it("is stable regardless of insertion order", () => {
    const a = canonicalize({ x: 1, y: { d: 4, c: 3 }, z: [1, 2] });
    const b = canonicalize({ z: [1, 2], y: { c: 3, d: 4 }, x: 1 });
    expect(a).toBe(b);
  });

  it("omits keys whose value is undefined", () => {
    expect(canonicalize({ a: 1, b: undefined, c: 3 })).toBe('{"a":1,"c":3}');
  });

  it("preserves array order and null array holes", () => {
    expect(canonicalize([3, 1, 2])).toBe("[3,1,2]");
    expect(canonicalize([1, undefined, 3])).toBe("[1,null,3]");
  });

  it("serializes primitives and escapes strings", () => {
    expect(canonicalize(null)).toBe("null");
    expect(canonicalize(true)).toBe("true");
    expect(canonicalize(false)).toBe("false");
    expect(canonicalize(42)).toBe("42");
    expect(canonicalize('he said "hi"\n')).toBe('"he said \\"hi\\"\\n"');
  });

  it("throws on non-finite numbers", () => {
    expect(() => canonicalize(Number.NaN)).toThrow(CanonicalError);
    expect(() => canonicalize(Number.POSITIVE_INFINITY)).toThrow(CanonicalError);
  });

  it("throws on bigint and top-level undefined", () => {
    expect(() => canonicalize(10n)).toThrow(CanonicalError);
    expect(() => canonicalize(undefined)).toThrow(CanonicalError);
  });

  it("canonicalBytes yields UTF-8 of the canonical string", () => {
    const bytes = canonicalBytes({ a: 1 });
    expect(new TextDecoder().decode(bytes)).toBe('{"a":1}');
  });
});
