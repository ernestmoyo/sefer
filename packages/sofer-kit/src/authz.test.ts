import { describe, it, expect } from "vitest";
import { AllowlistAuthorizer, openAuthorizer } from "./authz";
import { mintReshumah } from "./testkit";

describe("openAuthorizer", () => {
  it("allows anything", () => {
    const { record } = mintReshumah();
    expect(openAuthorizer.authorize({ record, existing: null })).toEqual({ allowed: true });
  });
});

describe("AllowlistAuthorizer", () => {
  it("allows a listed key in the governed parashah", () => {
    const { record } = mintReshumah({ shem: "shem://acme.maps.geocoder" });
    const authz = new AllowlistAuthorizer({ acme: [record.publicKey.kid] });
    expect(authz.authorize({ record, existing: null }).allowed).toBe(true);
  });

  it("rejects an unlisted key", () => {
    const { record } = mintReshumah({ shem: "shem://acme.maps.geocoder" });
    const authz = new AllowlistAuthorizer({ acme: ["u-some-other-key"] });
    const result = authz.authorize({ record, existing: null });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("not allowed");
  });

  it("lets the longest matching prefix win", () => {
    const { record } = mintReshumah({ shem: "shem://acme.maps.geocoder" });
    const authz = new AllowlistAuthorizer({
      acme: ["u-org-wide-key"],
      "acme.maps": [record.publicKey.kid],
    });
    expect(authz.authorize({ record, existing: null }).allowed).toBe(true);
  });

  it("keeps the root parashah open", () => {
    const { record } = mintReshumah({ shem: "shem://triage" });
    const authz = new AllowlistAuthorizer({});
    expect(authz.authorize({ record, existing: null }).allowed).toBe(true);
  });

  it("rejects a parashah with no policy", () => {
    const { record } = mintReshumah({ shem: "shem://unknown.agent" });
    const authz = new AllowlistAuthorizer({ acme: ["x"] });
    const result = authz.authorize({ record, existing: null });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("no inscription policy");
  });
});
