import {
  createReshumah,
  generateShaliachKeypair,
  type Endpoint,
  type Capability,
  type Reshuma,
  type ShaliachKeypair,
} from "@sefer/core";

/** Test helper: mint a sealed reshumah with sensible defaults. */
export function mintReshumah(
  overrides: {
    shem?: string;
    version?: string;
    keypair?: ShaliachKeypair;
    endpoints?: Endpoint[];
    capabilities?: Capability[];
    ttl?: number;
    now?: Date;
  } = {},
): { record: Reshuma; keypair: ShaliachKeypair } {
  const keypair = overrides.keypair ?? generateShaliachKeypair();
  const record = createReshumah(
    {
      shem: overrides.shem ?? "shem://acme.maps.geocoder",
      version: overrides.version ?? "1.0.0",
      endpoints: overrides.endpoints ?? [
        { protocol: "mcp", transport: "http", url: "https://geocoder.acme.dev/mcp" },
      ],
      capabilities: overrides.capabilities ?? [
        { id: "geocode", intent: "turn a street address into latitude and longitude", ref: "mcp:tool/geocode", tags: ["geo", "maps"] },
      ],
      ...(overrides.ttl !== undefined ? { ttl: overrides.ttl } : {}),
    },
    keypair,
    overrides.now ?? new Date("2026-06-09T00:00:00.000Z"),
  );
  return { record, keypair };
}
