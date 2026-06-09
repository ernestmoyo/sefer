import { z } from "zod";

/**
 * An endpoint says *how* to reach a shaliach. Sefer is transport-agnostic; `protocol`
 * enumerates known bindings and is open for extension. See docs/PROTOCOL.md §2.1.
 */
export const EndpointSchema = z.object({
  /** What to speak to the agent. */
  protocol: z.enum(["mcp", "a2a", "http", "openapi", "grpc", "sefer"]),
  /** How bytes move (optional). */
  transport: z.enum(["stdio", "http", "sse", "ws"]).optional(),
  /** Endpoint location. */
  url: z.string().url(),
  /** How to authenticate to the endpoint (optional). */
  auth: z.enum(["none", "apikey", "oauth2", "mtls"]).optional(),
  /** Latency/locality hint for endpoint selection (optional). */
  region: z.string().optional(),
});

export type Endpoint = z.infer<typeof EndpointSchema>;
