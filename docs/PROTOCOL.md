# Sefer Protocol — `sefer/0.1`

> Status: **draft / evolving.** This document is normative for the `@sefer/core` data
> models and wire formats. Keywords MUST / SHOULD / MAY follow RFC 2119.

Sefer defines four things: an **address grammar** (the *shem*), a **record format**
(the *reshumah*), a **capability descriptor**, and a **seal** (the *chotam*) that makes
records self-certifying. It does **not** define a transport for agent work itself — that
is MCP, A2A, HTTP, etc. Sefer only tells you which of those to speak and to whom.

---

## 1. The shem (address)

A *shem* names one shaliach. It is hierarchical and DNS-inspired, read left→right from
broad to specific. The **last label is the agent name**; preceding labels form the
**parashah** (namespace).

### 1.1 Grammar

```
shem        = [ "shem://" ] labels [ "@" version ] [ "#" capability ]
labels      = label *( "." label )          ; >= 1 label; last = name, rest = parashah
label       = lowalnum *( lowalnum / "-" ) lowalnum / lowalnum
lowalnum    = %x61-7A / %x30-39             ; a-z 0-9  (lowercase only, DNS-safe)
version     = semver or npm-style range      ; e.g. "1.4.0", "^1.2", "1.x"
capability  = 1*( lowalnum / "-" )           ; selects one capability id
```

- Labels are **case-insensitive on input, normalized to lowercase** on storage.
- A label MUST be 1–63 characters; the full label set MUST be ≤ 255 characters.
- The empty parashah (a single label) is the **root** section, reserved for testing and
  well-known agents; production agents SHOULD be namespaced.

### 1.2 Examples

| shem | parashah | name | version | capability |
|---|---|---|---|---|
| `shem://acme.maps.geocoder` | `acme.maps` | `geocoder` | — | — |
| `shem://acme.maps.geocoder@^1.2` | `acme.maps` | `geocoder` | `^1.2` | — |
| `shem://acme.maps.geocoder#geocode` | `acme.maps` | `geocoder` | — | `geocode` |
| `shem://triage` | *(root)* | `triage` | — | — |

The canonical string form omits the `shem://` scheme only when context is unambiguous;
on the wire the scheme is RECOMMENDED.

### 1.3 Resolution authority (delegation)

Which Sofer is authoritative for a parashah is determined by delegation, DNS-style:
the longest parashah prefix with a registered **delegation record** wins. In `v0.1` the
client is configured with one or more Sofer endpoints and queries them directly;
cross-Sofer delegation and referral are specified in `sefer/0.2` (see ROADMAP).

---

## 2. The reshumah (record)

A *reshumah* is the inscribed record for one shaliach at one version. It is a JSON object.

```jsonc
{
  "v": "sefer/0.1",                         // protocol version (required)
  "shem": "shem://acme.maps.geocoder",      // canonical address (required)
  "shaliach": {
    "id": "did:sefer:acme.maps:geocoder",   // stable identity (required)
    "name": "geocoder",
    "parashah": ["acme", "maps"],
    "version": "1.4.0",                      // semver (required)
    "title": "Acme Geocoder",
    "description": "Address ⇄ coordinates."
  },
  "endpoints": [                            // >= 1 required; how to actually reach it
    { "protocol": "mcp", "transport": "http",
      "url": "https://geocoder.acme.dev/mcp", "auth": "oauth2", "region": "eu-west" }
  ],
  "capabilities": [ /* see §3 */ ],
  "publicKey": {                            // the shaliach's own key (required)
    "alg": "ed25519",
    "kid": "z6Mk...",                       // key id = multibase thumbprint
    "jwk": { "kty": "OKP", "crv": "Ed25519", "x": "..." }
  },
  "trust": {
    "level": "self",                        // SELF-CLAIM ONLY; never used to elevate (§4.2)
    "vouchedBy": []                         // optional self-asserted hint; the authoritative
                                            // vouches are chotam.counterSeals (outside the body)
  },
  "meta": {
    "createdAt": "2026-06-09T00:00:00.000Z",
    "updatedAt": "2026-06-09T00:00:00.000Z",
    "expiresAt": "2026-06-16T00:00:00.000Z",
    "ttl": 300                              // seconds a resolver MAY cache (DNS-like)
  },
  "chotam": { /* see §4 — the seal over everything above */ }
}
```

### 2.1 Endpoints

An endpoint says **how** to reach the shaliach. Sefer is transport-agnostic; the
`protocol` enumerates known bindings and is open for extension.

| field | values | notes |
|---|---|---|
| `protocol` | `mcp` \| `a2a` \| `http` \| `openapi` \| `grpc` \| `sefer` | what to speak |
| `transport` | `stdio` \| `http` \| `sse` \| `ws` | how bytes move (optional) |
| `url` | URI | endpoint location |
| `auth` | `none` \| `apikey` \| `oauth2` \| `mtls` | how to authenticate (optional) |
| `region` | string | hint for latency-aware selection (optional) |

Multiple endpoints MAY be listed (multi-protocol, multi-region). A resolver chooses.

---

## 3. The capability descriptor

Capabilities are **first-class** — this is the core thing DNS lacks. They let agents be
discovered by *what they do*. A capability bridges to the underlying protocol's unit of
work (an MCP tool, an A2A skill, an HTTP operation) via `ref`.

```jsonc
{
  "id": "geocode",                          // unique within the reshumah (required)
  "title": "Geocode an address",
  "description": "Convert a free-form postal address into WGS84 coordinates.",
  "intent": "turn a street address into latitude/longitude",  // for semantic discovery
  "input":  { /* JSON Schema (optional) */ },
  "output": { /* JSON Schema (optional) */ },
  "ref": "mcp:tool/geocode",                // pointer into the endpoint's own namespace
  "tags": ["geo", "maps"]
}
```

- `intent` is a short natural-language statement used by `discover()` for semantic
  matching. It is advisory, not a contract.
- `input` / `output` are JSON Schema; when present they are the contract a caller can
  validate against before invoking.
- `ref` schemes: `mcp:tool/<name>`, `a2a:skill/<id>`, `http:<METHOD> <path>`, or a bare
  string the endpoint understands.

---

## 4. The chotam (seal)

The *chotam* makes a reshumah **self-certifying**: anyone can verify the record was
produced by the holder of `publicKey`, without trusting the Sofer that served it.

```jsonc
{
  "alg": "ed25519",
  "sig": "base64url(signature)",            // over the canonicalized record sans chotam
  "kid": "z6Mk...",                         // MUST match shaliach.publicKey.kid
  "signedAt": "2026-06-09T00:00:00.000Z",
  "counterSeals": [                         // optional — a Sofer/org vouching
    { "kid": "z6Mso...", "sig": "...", "role": "sofer", "signedAt": "..." }
  ]
}
```

### 4.1 Signing procedure (self-seal)

1. Take the full reshumah **without** the `chotam` field.
2. Serialize it with **Sefer Canonical JSON** (§5).
3. Sign the UTF-8 bytes with the shaliach's Ed25519 private key (RFC 8032).
4. Set `chotam = { alg, sig, kid, signedAt }`.

### 4.2 Verification

1. Strip `chotam`; canonicalize; verify `chotam.sig` against `publicKey.jwk`.
2. Assert `chotam.kid === publicKey.kid` and that `kid` is the correct thumbprint of `jwk`.
3. Each `counterSeal` is evaluated per §4.3 against an issuer key the **verifier**
   independently trusts; an unrecognized or invalid counter-seal is ignored, not an error.

A record that fails step 1 or 2 MUST be rejected. The body's `trust.level` is a self-claim
and MUST NOT be used to elevate trust; the **effective** level is computed by the verifier
from recognized counter-seals (§4.3, ARCHITECTURE §4). Self-seal alone yields `self`.

### 4.3 Counter-seals & domain separation (`sefer/0.2`)

Every signed object kind other than the self-seal is **domain-separated**: it signs the
canonical bytes of `{ "typ": <constant tag>, "payload": <object> }`, where `typ` is a
unique constant (e.g. `"sefer-counterseal/0.2"`). A verifier reconstructs the preimage
with the expected `typ`, so a signature minted for one kind can never be replayed as
another. The self-seal (§4.1) remains untagged for `sefer/0.1` wire-compatibility; its
in-body `v` and full record shape are its discriminator and cannot collide with a tagged
preimage's bytes.

A **counter-seal** lets a Sofer or org vouch for a record. Its `payload` MUST commit to:

```jsonc
{
  "sealSig":    "<the record's chotam.sig>",  // binds the vouch to this exact sealed record
  "subjectKid": "<the record's publicKey.kid>",
  "role":       "sofer",                       // advisory; see below
  "signedAt":   "2026-06-09T00:00:00.000Z",
  "proofRef":   "<optional DomainProof pointer>"
}
```

signed with the issuer's Ed25519 key, producing `counterSeals[] = { kid, sig, role,
signedAt, proofRef? }`. To evaluate a counter-seal a verifier:

1. looks up `seal.kid` in its **own** set of trusted issuers; if absent, ignore the seal;
2. reconstructs the tagged preimage from the record and verifies `seal.sig` against the
   trusted issuer's key; if it fails, ignore the seal;
3. grants the level its **own** trust entry assigns to that issuer — **never** the seal's
   self-asserted `role`.

The effective level is the highest grant among recognized seals, else `self`. Because the
counter-seal lives outside the signed body, appending one never invalidates the self-seal.
Freshness is enforced at evaluation: an **expired** record grants no level (only `self`),
and a **post-dated** seal (`signedAt` after the verifier's clock) is ignored.

The `verified` level is granted to issuers the verifier recognizes as verification
authorities — e.g. a CA it has configured out of band, taking responsibility for the
key↔org binding. A **DomainProof** object that *automates* establishing that binding
(DNS-TXT / X.509) is specified in a later `sefer/0.2` increment; it is a convenience for
discovering such issuers, not a precondition for the level.

---

## 5. Sefer Canonical JSON (SCJ)

Signatures require byte-stable serialization. SCJ is a JCS-compatible (RFC 8785) subset
sufficient for Sefer's value types:

- Object keys are sorted by Unicode code point, ascending.
- No insignificant whitespace.
- Keys whose value is `undefined` are omitted.
- Strings use minimal JSON escaping (`JSON.stringify` semantics).
- Numbers MUST be finite; Sefer records SHOULD use integers and strings only and avoid
  floats in signed fields to sidestep float-formatting ambiguity.
- `null`, `true`, `false` serialize literally.
- Arrays preserve order.

The reference implementation is `@sefer/core`'s `canonicalize()`.

---

## 6. Versioning

The protocol version `v` (e.g. `sefer/0.1`, `sefer/0.2`) is part of every signed record.
Minor versions add optional fields only (backward-compatible). Forward-compatibility is
**normative**:

- A verifier MUST accept any `sefer/0.x` record it structurally understands, and MUST
  ignore unknown fields it does not understand.
- A verifier MUST NOT strip unknown fields before re-verifying a signature.
- Records are minted at the lowest version whose fields they use; a `sefer/0.1` record is
  fully valid under a `sefer/0.2` verifier and may carry `sefer/0.2` counter-seals (which
  live outside the signed body).

There is **one** version line per generation (`sefer/0.2`), shared by all object kinds;
object kinds are distinguished by the domain `typ` tag (§4.3) and by route/schema, never
by parallel per-kind version strings.
