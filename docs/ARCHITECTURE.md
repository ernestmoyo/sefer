# Sefer — Architecture & Reasoning

This document is the *why*. The normative *what* lives in [`PROTOCOL.md`](PROTOCOL.md).

## 1. Problem, from first principles

Put many AI agents in a shared environment and they need three things web services
needed in the 1980s–90s, plus one thing the web never had:

1. **Stable names** decoupled from location. An agent must keep its identity when it
   moves host, scales out, or changes transport.
2. **Runtime discovery.** New agents come online continuously. Wiring them by hand —
   the status quo in agent frameworks — does not scale and defeats the point of
   autonomy. Discovery must happen *at runtime*, *by the agents themselves*.
3. **Trust without central trust.** In an open network you cannot assume the directory
   is honest. A found record must prove itself.
4. **(New) Discovery by capability, not just by name.** A caller usually does not know
   the name of the agent it needs — it knows the *job to be done*. DNS answers "where is
   `X`"; agents also need "who can do `Y`".

Sefer is the minimal layer that answers all four, and **nothing more** — it is not a
runtime, not a message bus, not an orchestration framework. It is the index and the
notary. Everything else (how agents actually do work together) is left to MCP, A2A,
HTTP, and the orchestrators that already exist. This restraint is the design.

## 2. What we take from DNS — and what we refuse

DNS is the closest prior art, and the instinct to copy it wholesale is the first trap.

**Transfers well:**
- **Hierarchical names + delegation.** A parashah can be delegated to a different Sofer,
  exactly as a DNS zone is delegated to a nameserver. Scales administration without a
  single root operator.
- **Caching + TTL.** Records carry a TTL; resolvers cache. Discovery at the speed of a
  cache hit is what makes runtime discovery affordable.
- **A record format separate from the transport.** DNS separates the zone file from the
  wire. Sefer separates the reshumah from how you query for it.

**Does NOT transfer — and why:**
- **"A name → a fixed host."** Agents are not hosts. A shem resolves to a *record* with
  possibly many endpoints across protocols and regions, plus capabilities and a key.
- **"The resolver is the root of trust."** DNS without DNSSEC trusts whoever answers.
  Sefer cannot: in an open agent network the answerer may lie. So **records are
  self-certifying** (`chotam`) — you verify the record, not the messenger.
- **"Capabilities are out of scope."** DNS has no notion of what a host *does*. For
  agents that is the most important query. Capabilities are first-class in Sefer.
- **"Records are static."** Agents evolve. Sefer records are versioned and short-TTL'd
  by default, and capability descriptors carry an `intent` precisely because the exact
  shape changes faster than DNS records ever did.

## 3. Conceptual architecture

```
        ┌─────────────┐        inscribe / re-seal        ┌──────────────────┐
        │  shaliach   │ ───────────────────────────────▶ │      Sofer       │
        │  (an agent) │                                   │ (registry node)  │
        │  holds key  │ ◀─────────── ack (vouch?) ─────── │  stores reshumot │
        └─────────────┘                                   │  serves queries  │
              ▲                                            └──────────────────┘
              │ resolve(shem) / discover(intent)                    ▲
              │                                                     │ delegation (v0.2+)
        ┌─────────────┐    self-verify chotam, no trust in    ┌──────────────────┐
        │  caller     │ ◀──── the Sofer required ────────────│  other Sofarim   │
        │  (an agent) │                                       └──────────────────┘
        └─────────────┘
```

Three roles, deliberately few:

- **shaliach** — any agent. Generates its own keypair (self-sovereign), builds a
  reshumah, self-seals it, and inscribes it with a Sofer. Re-inscribes before TTL expiry
  (a heartbeat — see §6 on staleness).
- **Sofer** — a registry node. Stores reshumot, serves `resolve` and `discover`,
  enforces parashah authorization, optionally **counter-seals** to vouch. A Sofer is
  *not* trusted for record integrity — only for availability and for its own vouching.
- **caller** — any agent doing a lookup. Always re-verifies the chotam locally.

The same process is usually both a shaliach and a caller. The roles are hats, not tiers.

## 4. Trust & governance — a first-class concern

Trust is layered so the cheap case is cheap and the strong case is possible.

| `trust.level` | Established by | Means |
|---|---|---|
| `self` | the shaliach's own chotam verifies | "This record was made by the holder of this key." Identity continuity, nothing more. |
| `vouched` | a Sofer counter-seal whose `kid` the caller recognizes | "A registry I trust asserts this agent belongs in this parashah." |
| `verified` | an out-of-band proof bound into the record (e.g. DNS TXT / domain control, org cert) | "An external authority ties this key to a real-world org." |

Design rules:

- **No ambient authority.** Inscribing into a parashah requires authorization the Sofer
  checks (an org policy, a delegated key, a domain proof). Anyone may inscribe into the
  *root* parashah; nobody should *trust* the root parashah.
- **Self-sovereign keys.** The shaliach holds its private key. The Sofer never sees it
  and cannot forge records. Key rotation is a new record sealed by the old key
  countersigning the new key (rotation chain — `sefer/0.2`).
- **Auditability.** Every inscription is an append; a Sofer keeps a tamper-evident log
  (hash-chained) so the history of a shem is inspectable. Humans and orgs retain
  control by owning the Sofer for their parashot and approving counter-seals.
- **Capability claims are not capability grants.** A reshumah *advertises* what an agent
  can do; it never *authorizes* a caller. Authorization is enforced at the endpoint
  (OAuth2/mTLS), exactly as today. Sefer is the phone book, not the lock.

## 5. Adversarial cases & how the design answers them

- **A Sofer lies / is compromised.** It cannot alter a record without breaking the
  chotam; callers re-verify. The worst it can do is *omit* records (censor) or serve
  *stale* ones. Mitigations: multi-Sofer queries, signed "no such record" responses
  (`sefer/0.2`), and the hash-chained log for after-the-fact detection.
- **An agent lies about its capabilities.** `intent`/schemas are claims. Defenses are
  (a) the endpoint still enforces auth, so a false claim buys nothing it was not already
  allowed to do, and (b) a future **reputation parashah** (§7) where callers attest to
  outcomes, decoupled from the agent's own claims.
- **Squatting / impersonation.** Names are authorization-gated per parashah; the root is
  explicitly untrusted. `verified` level binds keys to real-world identity.
- **Stale records / dead agents** — see §6.
- **Partition.** Resolvers serve cached records within TTL during a Sofer outage; a
  partitioned Sofer serves what it has and marks records it cannot refresh. Sefer favors
  **availability + verifiability** over strong consistency: a slightly stale but
  cryptographically valid record is usually more useful to an agent than an error.

## 6. Staleness — the hardest steady-state problem

Agents appear and vanish constantly, so the dominant failure mode is not a wrong record
but a **confidently stale** one. Defenses, layered:

1. **Short TTLs + expiry.** Records carry `ttl` and `expiresAt`. Past expiry a resolver
   MUST treat a record as suspect (serve-stale-but-flag, never serve-stale-silently).
2. **Re-inscription as heartbeat.** A live shaliach re-seals periodically. Missed
   heartbeats let a Sofer mark a record `dormant`.
3. **Liveness hints, not liveness guarantees.** Sefer never promises an endpoint is up —
   that is the caller's connect attempt. Sefer promises the *record* is fresh and
   authentic. Conflating the two is a known anti-pattern we avoid by construction.

## 7. Beyond v0.1 — where novelty earns its place

Add an abstraction only when it pays for itself:

- **Reputation parashah.** Outcome attestations (`caller X reports capability Y of agent
  Z succeeded`) as their own sealed records, so trust in *behavior* is separate from the
  agent's self-claims and from registry vouching.
- **Capability ontology / semantic discovery.** `intent` strings → embeddings →
  vector search in the Sofer, with an optional shared tag taxonomy. Start with plain
  text + tags; graduate to embeddings only when scale demands it.
- **Negotiation.** When multiple endpoints/protocols exist, a lightweight content-
  negotiation step (caller states accepted protocols/auth; record advertises options).
- **Federation.** Cross-Sofer referral and a small set of well-known public Sofarim,
  so discovery can cross organizational boundaries the way email crosses mail servers.

Each is deferred until the core is proven. The core is: **name, find, trust.**

## 8. Non-goals

- Not an orchestration framework, scheduler, or message bus.
- Not a new agent-to-agent transport (use MCP/A2A/HTTP).
- Not an authorization server (endpoints enforce authz).
- Not a blockchain. The hash-chained log is a local tamper-evident audit aid, not a
  global consensus system; federation uses delegation and signatures, not a ledger.
