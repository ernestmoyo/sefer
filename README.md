<div align="center">

# ספר · Sefer

**The Book of Names — a discovery, naming, and trust layer for AI agents.**

*DNS gave machines a way to find each other. Sefer gives agents one.*

</div>

---

## The gap

The agent ecosystem has rich plumbing for **how** an agent talks to a tool or another agent — Anthropic's **MCP** (Model Context Protocol) for tools/servers, **A2A** for agent-to-agent messaging, OpenAPI for HTTP. What it does **not** have is an open answer to three older, more boring questions that every distributed system eventually has to answer:

1. **Naming** — what is this agent *called*, stably, across time and relocation?
2. **Discovery** — given an intent or a name, how do I *find* an agent that can serve it, at runtime, without anyone having wired us together by hand?
3. **Trust** — when I find one, how do I know it is *who it claims to be* and *allowed to do what it claims to do*?

Today these are solved by hardcoding: agents are manually defined, endpoints are pasted into config, capabilities are assumed. That does not scale to a world of many agents coming online, evolving, and addressing one another. The web solved the equivalent problem with **DNS + TLS + a record format**. Sefer is the equivalent layer for agents — and it is deliberately *not* a new way for agents to talk. It sits **above** MCP/A2A/HTTP and tells you **which** of them to speak, to **whom**, and **whether to believe them**.

## The model in one sentence

> The scribe (**Sofer**) inscribes emissaries (**shlichim**) into the Book (**Sefer**), each under a name (**shem**) within a section (**parashah**), every record sealed (**chotam**) so it can be trusted without trusting the scribe.

| Term | עברית | Meaning | Role in Sefer |
|---|---|---|---|
| **Sefer** | ספר | the book / register | the protocol + the registry: the Book of Names |
| **Sofer** | סופר | the scribe | a registry node that inscribes and serves records |
| **shaliach** (pl. *shlichim*) | שליח | emissary / agent | an addressable agent |
| **shem** | שם | name | an agent's name/address, e.g. `shem://acme.maps.geocoder` |
| **parashah** (pl. *parashot*) | פרשה | a portion / section | a namespace — the book is divided into sections |
| **reshumah** (pl. *reshumot*) | רשומה | a record / entry | the inscribed record describing one shaliach |
| **chotam** | חותם | a seal | the cryptographic seal proving authenticity & trust |

## How it feels (target DX)

```ts
import { Sefer } from "@sefer/sdk";

const sefer = new Sefer({ sofer: "https://sofer.acme.dev" });

// A shaliach inscribes itself — self-sovereign identity, self-sealed.
await sefer.inscribe({
  shem: "shem://acme.maps.geocoder",
  version: "1.4.0",
  endpoints: [{ protocol: "mcp", transport: "http", url: "https://geocoder.acme.dev/mcp" }],
  capabilities: [
    { id: "geocode", intent: "turn a street address into lat/long",
      ref: "mcp:tool/geocode" },
  ],
});

// Another agent discovers it — by name…
const rec = await sefer.resolve("shem://acme.maps.geocoder");

// …or by *intent*, with no prior knowledge it exists.
const matches = await sefer.discover({ intent: "address to coordinates", parashah: "acme.maps" });
```

`resolve()` is DNS-style lookup. `discover()` is the part DNS never had: **capability-based** matching, because agents are addressed by what they can *do*, not only by what they are *called*.

## Why not just reuse DNS / a service registry?

We borrow the good ideas and reject the ones that do not transfer — see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). In short: **keep** hierarchical names, delegation, caching, TTLs, and a record format; **reject** the assumption that a name maps to a fixed host, that capabilities are static, that the registry is the root of trust, and that lookup is purely by name. Sefer records are **self-certifying** (a record proves itself via its own `chotam`, so you do not have to trust the Sofer that served it), capabilities are **first-class and semantically discoverable**, and agents are **self-sovereign** (they hold their own keys).

## Repository layout

```
sefer/
├── packages/
│   ├── core/          @sefer/core — the protocol as code: addresses, records,
│   │                  capabilities, canonicalization, and the chotam seal.
│   │                  Pure, dependency-light, runs anywhere.
│   ├── sofer-kit/     @sefer/sofer-kit — registry building blocks: storage,
│   │                  TOFU authorization, hash-chained audit, discovery.
│   └── sdk/           @sefer/sdk — client: inscribe / resolve / discover, with
│                      local seal verification, TTL cache, and a heartbeat.
├── apps/
│   └── sofer/         @sefer/sofer-app — a reference Sofer (registry) over Hono.
├── examples/
│   └── demo/          runnable shlichim that inscribe & discover (`npm run demo`).
└── docs/
    ├── PROTOCOL.md       the wire format & data models (normative)
    ├── ARCHITECTURE.md   the reasoning, trust model, governance, edge cases
    └── ROADMAP.md        phased plan v0.1 → federation
```

## Quickstart

```bash
npm install
npm run build && npm test     # 81 tests across 4 packages
npm run demo                  # the full name·find·trust loop in one process

# …or run the network for real:
npm run sofer                 # reference Sofer on :8787
npm run inscribe -w @sefer/demo
npm run find -w @sefer/demo -- "convert an address to coordinates"
```

## Status

**v0.1 — Phases 0 & 1 done.** The `@sefer/core` protocol spine, the `sofer-kit` registry engine, the reference `Sofer` service, the `sdk`, and a runnable demo are all built and tested end to end (81 tests). This is an early, evolving protocol; the spec in `docs/` is the source of truth and is versioned (`sefer/0.1`). See [`docs/ROADMAP.md`](docs/ROADMAP.md) for what's next.

## License

Apache-2.0. A protocol meant for the globe should carry a patent grant.
