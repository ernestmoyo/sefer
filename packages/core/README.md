# @sefer/core

The **Sefer** protocol as code — the spine of the Book of Names.

Pure and dependency-light (just [zod](https://zod.dev)). No network. Everything you need
to build, seal, and verify an agent record offline.

```ts
import { generateShaliachKeypair, createReshumah, verifyReshumah } from "@sefer/core";

const keypair = generateShaliachKeypair();

const reshumah = createReshumah(
  {
    shem: "shem://acme.maps.geocoder",
    version: "1.4.0",
    endpoints: [{ protocol: "mcp", transport: "http", url: "https://geocoder.acme.dev/mcp" }],
    capabilities: [{ id: "geocode", intent: "address → lat/long", ref: "mcp:tool/geocode" }],
  },
  keypair,
);

const result = verifyReshumah(reshumah);
// → { ok: true, level: "self", reasons: [], expired: false }
```

## What's here

| Module | Exports |
|---|---|
| `address` | `Shem`, `parseShem`, `serializeShem`, `parashahString`, `isValidLabel` |
| `canonical` | `canonicalize`, `canonicalBytes` (Sefer Canonical JSON, RFC 8785 subset) |
| `identity` | `generateShaliachKeypair`, `jwkThumbprint`, `deriveDid`, `Jwk` |
| `capability` | `CapabilitySchema`, `Capability` |
| `endpoint` | `EndpointSchema`, `Endpoint` |
| `chotam` | `signObject`, `verifyObject`, `Chotam` (the Ed25519 seal) |
| `reshumah` | `createReshumah`, `verifyReshumah`, `ReshumaSchema`, `Reshuma`, trust levels |

See [`../../docs/PROTOCOL.md`](../../docs/PROTOCOL.md) for the normative spec.

## License

Apache-2.0
