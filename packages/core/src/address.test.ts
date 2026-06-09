import { describe, it, expect } from "vitest";
import { parseShem, serializeShem, parashahString, isValidLabel } from "./address";
import { ShemParseError } from "./errors";

describe("parseShem", () => {
  it("parses a namespaced shem", () => {
    const s = parseShem("shem://acme.maps.geocoder");
    expect(s.parashah).toEqual(["acme", "maps"]);
    expect(s.name).toBe("geocoder");
    expect(s.version).toBeUndefined();
    expect(s.capability).toBeUndefined();
  });

  it("parses without the scheme prefix", () => {
    expect(parseShem("acme.maps.geocoder").name).toBe("geocoder");
  });

  it("parses a root (single-label) shem", () => {
    const s = parseShem("shem://triage");
    expect(s.parashah).toEqual([]);
    expect(s.name).toBe("triage");
  });

  it("parses version and capability selectors", () => {
    const s = parseShem("shem://acme.maps.geocoder@^1.2#geocode");
    expect(s.version).toBe("^1.2");
    expect(s.capability).toBe("geocode");
    expect(s.name).toBe("geocoder");
  });

  it("normalizes case to lowercase", () => {
    const s = parseShem("Acme.Maps.GeoCoder");
    expect(s.parashah).toEqual(["acme", "maps"]);
    expect(s.name).toBe("geocoder");
  });

  it.each([
    "",
    "   ",
    "acme..geocoder",
    ".geocoder",
    "acme.-bad.geocoder",
    "acme.bad-.geocoder",
    "acme.UP_PER.geo", // underscore is not dns-safe
    "shem://",
  ])("rejects malformed shem %j", (bad) => {
    expect(() => parseShem(bad)).toThrow(ShemParseError);
  });

  it("rejects an over-long label", () => {
    const long = "a".repeat(64);
    expect(() => parseShem(`acme.${long}`)).toThrow(ShemParseError);
  });

  it("rejects an invalid version selector", () => {
    expect(() => parseShem("acme.geo@no spaces ok but ()parens")).toThrow(ShemParseError);
  });
});

describe("serializeShem", () => {
  it("round-trips through parse", () => {
    const input = "shem://acme.maps.geocoder@1.4.0#geocode";
    expect(serializeShem(parseShem(input))).toBe(input);
  });

  it("can omit the scheme", () => {
    expect(serializeShem(parseShem("acme.maps.geo"), { scheme: false })).toBe("acme.maps.geo");
  });

  it("throws on an invalid label during serialization", () => {
    expect(() => serializeShem({ parashah: ["BAD_NS"], name: "x" })).toThrow(ShemParseError);
  });
});

describe("helpers", () => {
  it("parashahString joins labels", () => {
    expect(parashahString(parseShem("acme.maps.geo"))).toBe("acme.maps");
  });

  it("isValidLabel guards length and charset", () => {
    expect(isValidLabel("geo-coder1")).toBe(true);
    expect(isValidLabel("-lead")).toBe(false);
    expect(isValidLabel("")).toBe(false);
    expect(isValidLabel("a".repeat(64))).toBe(false);
  });
});
