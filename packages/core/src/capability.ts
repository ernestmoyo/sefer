import { z } from "zod";

const CAPABILITY_ID_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/**
 * A first-class capability descriptor — what a shaliach can *do*. This is the part DNS
 * never had; it lets agents be discovered by intent, not only by name.
 * See docs/PROTOCOL.md §3.
 */
export const CapabilitySchema = z.object({
  /** Unique id within the reshumah, e.g. "geocode". */
  id: z.string().regex(CAPABILITY_ID_RE, "capability id must be lowercase dns-safe"),
  title: z.string().optional(),
  description: z.string().optional(),
  /** Short natural-language intent, used for semantic discovery. Advisory, not a contract. */
  intent: z.string().optional(),
  /** JSON Schema of the input (optional contract). */
  input: z.record(z.unknown()).optional(),
  /** JSON Schema of the output (optional contract). */
  output: z.record(z.unknown()).optional(),
  /** Pointer into the endpoint's own namespace, e.g. "mcp:tool/geocode", "a2a:skill/x". */
  ref: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export type Capability = z.infer<typeof CapabilitySchema>;
