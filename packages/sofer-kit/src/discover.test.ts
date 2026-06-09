import { describe, it, expect } from "vitest";
import { runDiscover, scoreRecord } from "./discover";
import { mintReshumah } from "./testkit";

const geocoder = mintReshumah({
  shem: "shem://acme.maps.geocoder",
  capabilities: [
    { id: "geocode", intent: "turn a street address into latitude and longitude", tags: ["geo"] },
  ],
}).record;

const weather = mintReshumah({
  shem: "shem://acme.weather.forecast",
  capabilities: [{ id: "forecast", intent: "predict tomorrow's weather", tags: ["weather"] }],
  endpoints: [{ protocol: "a2a", url: "https://weather.acme.dev/a2a" }],
}).record;

const all = [geocoder, weather];

describe("discover", () => {
  it("ranks by lexical intent overlap", () => {
    const hits = runDiscover(all, { intent: "address to coordinates latitude longitude" });
    expect(hits[0]?.record.shaliach.name).toBe("geocoder");
    expect(hits[0]?.matchedCapabilities).toContain("geocode");
  });

  it("filters by parashah prefix on label boundaries", () => {
    expect(runDiscover(all, { parashah: "acme.maps" }).map((h) => h.record.shaliach.name)).toEqual(["geocoder"]);
    expect(runDiscover(all, { parashah: "acme" }).length).toBe(2);
    expect(runDiscover(all, { parashah: "acm" }).length).toBe(0); // not a label-boundary match
  });

  it("filters by capability id", () => {
    expect(runDiscover(all, { capability: "forecast" }).map((h) => h.record.shaliach.name)).toEqual(["forecast"]);
  });

  it("filters by protocol", () => {
    expect(runDiscover(all, { protocol: "a2a" }).map((h) => h.record.shaliach.name)).toEqual(["forecast"]);
    expect(runDiscover(all, { protocol: "grpc" }).length).toBe(0);
  });

  it("filters by tags", () => {
    expect(runDiscover(all, { tags: ["weather"] }).map((h) => h.record.shaliach.name)).toEqual(["forecast"]);
  });

  it("honors the limit", () => {
    expect(runDiscover(all, { parashah: "acme", limit: 1 }).length).toBe(1);
  });

  it("scoreRecord returns null on a failed hard filter", () => {
    expect(scoreRecord(geocoder, { capability: "nope" })).toBeNull();
  });
});
