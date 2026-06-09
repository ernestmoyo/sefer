# Sefer — Roadmap

A protocol earns trust by being small, then proven, then extended. Each phase ships
something runnable and is gated on the previous one being solid.

## Phase 0 — Foundation `sefer/0.1` · ✅ done

The spine: the protocol as typed, tested code. No network yet.

- [x] Naming + ontology (Sefer / Sofer / shaliach / shem / parashah / reshumah / chotam)
- [x] `docs/PROTOCOL.md`, `docs/ARCHITECTURE.md`
- [x] `@sefer/core`
  - [x] shem address grammar — parse / serialize / validate
  - [x] Sefer Canonical JSON (`canonicalize`)
  - [x] reshumah + capability + endpoint Zod schemas
  - [x] chotam — Ed25519 self-seal + verify; key thumbprint (`kid`)
  - [x] identity helpers — keypair generation, `did:sefer` derivation
  - [x] tests ≥ 80% (≈94%) across address / canonical / chotam / schema
- [~] CI: workflow written (`.github/workflows/ci.yml`); awaiting `workflow` token scope to push

**Done:** an agent can build a reshumah, seal it, and another can verify it offline, one import.

## Phase 1 — A living registry `sefer/0.1` · ✅ core done

Networked and usable end to end. 81 tests green; `npm run demo` runs the full loop.

- [x] `@sefer/sofer-kit` — storage interface (Repository pattern) + in-memory adapter;
      parashah authorization (open + allowlist); always-on TOFU key-binding;
      hash-chained audit log; capability discovery (lexical)
- [x] `apps/sofer` — reference Sofer over HTTP (Hono): `inscribe`, `resolve`, `discover`,
      `audit`
- [x] `@sefer/sdk` — `inscribe` / `resolve` / `discover`, local chotam verification,
      TTL-aware client cache, re-inscription heartbeat helper
- [x] `examples/demo` — geocoder inscribes itself; a finder discovers it by intent;
      one-command `npm run demo` + a three-terminal realistic flow
- [ ] *carried to later:* SQLite/Postgres store adapter; `delegate` route + signed
      responses; invoking the discovered agent over a live MCP endpoint

**Done:** `examples/demo` runs the full loop against a Sofer with no hand-wiring.

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
