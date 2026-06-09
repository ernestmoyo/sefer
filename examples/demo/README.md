# @sefer/demo

Runnable proof of the **name · find · trust** loop.

## One command (self-contained)

Stands up a Sofer in-process, inscribes a geocoder, discovers it by intent, resolves it
with local seal verification — all in one process:

```bash
npm run demo
```

## The realistic flow (three terminals)

```bash
# 1. start the reference Sofer (registry)
npm run sofer                       # → http://localhost:8787

# 2. the geocoder inscribes itself and heartbeats
npm run inscribe -w @sefer/demo

# 3. another agent discovers it by intent — never knew its name
npm run find -w @sefer/demo -- "convert an address to coordinates"
```

Point any of these at a remote Sofer with `SOFER_URL=https://sofer.example.dev`.

## What this shows

- **Self-sovereign identity** — the geocoder generates its own keypair; the registry
  never sees the private key and cannot forge records.
- **Discovery by intent** — the finder asks for a *job*, not a name, and gets a ranked,
  capability-matched answer.
- **Trust without trusting the registry** — every record the client receives is
  re-verified locally against its own `chotam` before use.
