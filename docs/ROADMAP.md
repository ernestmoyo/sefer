# Sefer — Roadmap

A protocol earns trust by being small, then proven, then extended. Each phase ships
something runnable and is gated on the previous one being solid.

## Phase 0 — Foundation `sefer/0.1` · *in progress*

The spine: the protocol as typed, tested code. No network yet.

- [x] Naming + ontology (Sefer / Sofer / shaliach / shem / parashah / reshumah / chotam)
- [x] `docs/PROTOCOL.md`, `docs/ARCHITECTURE.md`
- [ ] `@sefer/core`
  - [ ] shem address grammar — parse / serialize / validate
  - [ ] Sefer Canonical JSON (`canonicalize`)
  - [ ] reshumah + capability + endpoint Zod schemas
  - [ ] chotam — Ed25519 self-seal + verify; key thumbprint (`kid`)
  - [ ] identity helpers — keypair generation, `did:sefer` derivation
  - [ ] tests ≥ 80% across address / canonical / chotam / schema
- [ ] CI: typecheck + build + test on every push

**Done when:** an agent can build a reshumah, seal it, and another can verify it — fully
offline, with one import.

## Phase 1 — A living registry `sefer/0.1`

Make it networked and usable end to end.

- [ ] `@sefer/sofer-kit` — storage interface (Repository pattern) + in-memory & SQLite
      adapters; parashah authorization; hash-chained audit log
- [ ] `apps/sofer` — reference Sofer over HTTP (Hono): `inscribe`, `resolve`, `discover`,
      `delegate`; serves signed responses
- [ ] `@sefer/sdk` — `inscribe` / `resolve` / `discover`, local chotam verification,
      TTL-aware client cache, re-inscription heartbeat helper
- [ ] `examples/` — a geocoder shaliach that inscribes itself; a caller that discovers it
      by intent and invokes it over MCP

**Done when:** `examples/` runs the full loop against a local Sofer with no hand-wiring.

## Phase 2 — Trust & capability depth `sefer/0.2`

- [ ] Counter-seals (`vouched`) and domain-proof (`verified`) trust levels
- [ ] Key rotation chains
- [ ] Signed negative responses ("no such shem"); multi-Sofer queries
- [ ] Semantic `discover()` — `intent` embeddings + vector search (pluggable)
- [ ] Reputation parashah — outcome attestations as sealed records

## Phase 3 — Federation `sefer/0.3`

- [ ] Cross-Sofer delegation + referral resolution
- [ ] A handful of well-known public Sofarim; bootstrap & caching strategy
- [ ] Conformance test suite any Sofer implementation can run to claim compatibility
- [ ] Reference SDKs beyond TS (Python first — the agent-builder default)

## Operating principles

- **Spec is the source of truth.** Code conforms to `docs/`, not the reverse.
- **Additive, signed, versioned.** New fields are optional; every record is sealed and
  carries its protocol version. Unknown fields survive a verify round-trip.
- **No abstraction before its proof.** Reputation, ontology, federation each wait until
  the simpler layer is demonstrably solid.
- **Live-data safety.** A Sofer holds others' identity records; inscription is
  append-only and authorization-gated, deletion is tombstoning, never silent overwrite.
