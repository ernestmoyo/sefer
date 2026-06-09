import { Hono } from "hono";
import { SEFER_PROTOCOL_VERSION } from "@sefer/core";
import type { AuditLog, Sofer } from "@sefer/sofer-kit";

export interface AppDeps {
  sofer: Sofer;
  /** Optional audit log, exposed read-only at GET /v1/audit for transparency. */
  audit?: AuditLog;
}

const CODE_STATUS: Record<string, number> = {
  ERR_INVALID_RESHUMA: 400,
  ERR_NAME_BOUND: 409,
  ERR_UNAUTHORIZED: 403,
};

/**
 * Build the Sofer HTTP app. Pure factory (no listening) so it can be tested in-process
 * and served by any runtime — Node, Bun, edge.
 */
export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  app.get("/", (c) =>
    c.json({ name: "sefer-sofer", protocol: SEFER_PROTOCOL_VERSION, endpoints: ["/v1/inscribe", "/v1/resolve", "/v1/discover", "/v1/audit"] }),
  );

  app.get("/healthz", (c) => c.json({ ok: true }));

  app.post("/v1/inscribe", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ ok: false, code: "ERR_BAD_JSON", error: "request body is not valid JSON" }, 400);
    }
    const result = await deps.sofer.inscribe(body);
    if (result.ok) return c.json(result, 200);
    const status = (result.code && CODE_STATUS[result.code]) ?? 400;
    return c.json(result, status as 400 | 403 | 409);
  });

  app.get("/v1/resolve", async (c) => {
    const shem = c.req.query("shem");
    if (!shem) return c.json({ error: "missing ?shem" }, 400);
    try {
      const record = await deps.sofer.resolve(shem);
      if (!record) return c.json({ error: "no such shem" }, 404);
      return c.json(record, 200);
    } catch (err) {
      return c.json({ error: `invalid shem: ${(err as Error).message}` }, 400);
    }
  });

  app.get("/v1/discover", async (c) => {
    const q = c.req.query();
    const tags = q.tags ? q.tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined;
    const limit = q.limit ? Number.parseInt(q.limit, 10) : undefined;
    const hits = await deps.sofer.discover({
      ...(q.intent ? { intent: q.intent } : {}),
      ...(q.parashah ? { parashah: q.parashah } : {}),
      ...(q.capability ? { capability: q.capability } : {}),
      ...(q.protocol ? { protocol: q.protocol } : {}),
      ...(tags ? { tags } : {}),
      ...(limit !== undefined && Number.isFinite(limit) ? { limit } : {}),
    });
    return c.json({ results: hits }, 200);
  });

  app.get("/v1/audit", async (c) => {
    if (!deps.audit) return c.json({ error: "audit log not enabled" }, 404);
    const [entries, chain] = await Promise.all([deps.audit.entries(), deps.audit.verifyChain()]);
    return c.json({ entries, chain }, 200);
  });

  return app;
}
