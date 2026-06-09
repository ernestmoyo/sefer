import { z } from "zod";
import { deriveDid, jwkThumbprint, JwkSchema, type ShaliachKeypair } from "./identity";
import { CapabilitySchema, type Capability } from "./capability";
import { EndpointSchema, type Endpoint } from "./endpoint";
import { ChotamSchema } from "./chotam";
import { signObject, verifyObject } from "./chotam";
import { parseShem, serializeShem, type Shem } from "./address";
import { SEFER_PROTOCOL_VERSION } from "./version";

const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/** Trust levels, lowest→highest. See docs/ARCHITECTURE.md §4. */
export const TRUST_LEVELS = ["self", "vouched", "verified"] as const;
export type TrustLevel = (typeof TRUST_LEVELS)[number];

const ShaliachBlockSchema = z.object({
  id: z.string().min(1),
  name: z.string().regex(LABEL_RE),
  parashah: z.array(z.string().regex(LABEL_RE)),
  version: z.string().min(1),
  title: z.string().optional(),
  description: z.string().optional(),
});

const PublicKeySchema = z.object({
  alg: z.literal("ed25519"),
  kid: z.string().min(1),
  jwk: JwkSchema,
});

const TrustSchema = z.object({
  level: z.enum(TRUST_LEVELS),
  vouchedBy: z.array(z.string()).optional(),
});

const MetaSchema = z.object({
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  ttl: z.number().int().nonnegative(),
});

/** The reshumah without its seal — the exact payload the chotam signs over. */
export const UnsealedReshumaSchema = z.object({
  v: z.literal(SEFER_PROTOCOL_VERSION),
  shem: z.string().min(1),
  shaliach: ShaliachBlockSchema,
  endpoints: z.array(EndpointSchema).min(1),
  capabilities: z.array(CapabilitySchema),
  publicKey: PublicKeySchema,
  trust: TrustSchema,
  meta: MetaSchema,
});

export type UnsealedReshuma = z.infer<typeof UnsealedReshumaSchema>;

/** A complete, sealed reshumah. */
export const ReshumaSchema = UnsealedReshumaSchema.extend({
  chotam: ChotamSchema,
});

export type Reshuma = z.infer<typeof ReshumaSchema>;

/** Parameters for inscribing a new shaliach. */
export interface CreateReshumaParams {
  /** Canonical shem string, e.g. "shem://acme.maps.geocoder". */
  shem: string;
  /** Semver of this agent build, e.g. "1.4.0". */
  version: string;
  /** At least one reachable endpoint. */
  endpoints: Endpoint[];
  capabilities?: Capability[];
  title?: string;
  description?: string;
  /** Seconds a resolver may cache; default 300. */
  ttl?: number;
}

const DEFAULT_TTL_SECONDS = 300;

/**
 * Build and self-seal a reshumah for a shaliach. The record is validated before
 * sealing, so a returned Reshuma is always structurally and cryptographically sound.
 */
export function createReshumah(
  params: CreateReshumaParams,
  keypair: ShaliachKeypair,
  now: Date = new Date(),
): Reshuma {
  const shem: Shem = parseShem(params.shem);
  const iso = now.toISOString();
  const ttl = params.ttl ?? DEFAULT_TTL_SECONDS;
  const expiresAt = new Date(now.getTime() + ttl * 1000).toISOString();

  const shaliach = {
    id: deriveDid(shem),
    name: shem.name,
    parashah: [...shem.parashah],
    version: params.version,
    ...(params.title !== undefined ? { title: params.title } : {}),
    ...(params.description !== undefined ? { description: params.description } : {}),
  };

  const unsealed: UnsealedReshuma = {
    v: SEFER_PROTOCOL_VERSION,
    shem: serializeShem({ parashah: shem.parashah, name: shem.name }),
    shaliach,
    endpoints: params.endpoints,
    capabilities: params.capabilities ?? [],
    publicKey: { alg: "ed25519", kid: keypair.kid, jwk: keypair.publicJwk },
    trust: { level: "self" },
    meta: { createdAt: iso, updatedAt: iso, expiresAt, ttl },
  };

  const validated = UnsealedReshumaSchema.parse(unsealed);
  const chotam = signObject(
    validated as unknown as Record<string, unknown>,
    keypair.privateJwk,
    keypair.kid,
    iso,
  );

  return { ...validated, chotam };
}

/** The outcome of verifying a reshumah. */
export interface VerifyOutcome {
  /** True only if the record is structurally valid and the self-seal verifies. */
  ok: boolean;
  /** Established trust level, or "invalid" if verification failed. */
  level: TrustLevel | "invalid";
  /** Human-readable reasons for any failures (empty when ok). */
  reasons: string[];
  /** True when the record's expiresAt is in the past (advisory; does not set ok=false). */
  expired: boolean;
}

/**
 * Verify a reshumah end to end:
 *  1. structural shape (schema),
 *  2. key integrity (publicKey.kid is the true thumbprint of publicKey.jwk),
 *  3. seal binding (chotam.kid === publicKey.kid),
 *  4. self-seal signature over the *raw* record sans chotam (unknown fields preserved),
 *  5. shem ↔ shaliach consistency.
 *
 * Counter-seal (vouched/verified) evaluation arrives in Phase 2; today a valid record
 * is reported at level "self".
 */
export function verifyReshumah(record: unknown, now: Date = new Date()): VerifyOutcome {
  const reasons: string[] = [];

  const parsed = ReshumaSchema.safeParse(record);
  if (!parsed.success) {
    return { ok: false, level: "invalid", reasons: [`schema: ${parsed.error.message}`], expired: false };
  }
  const r = parsed.data;

  // Key integrity.
  const thumb = jwkThumbprint(r.publicKey.jwk);
  if (thumb !== r.publicKey.kid) {
    reasons.push("publicKey.kid is not the thumbprint of publicKey.jwk");
  }
  if (r.chotam.kid !== r.publicKey.kid) {
    reasons.push("chotam.kid does not match publicKey.kid");
  }

  // Signature over the RAW record minus chotam (per PROTOCOL §6: do not strip unknown
  // fields before re-verifying). We use the original input object, not the parsed one.
  const raw = record as Record<string, unknown>;
  const { chotam: _omit, ...unsealedRaw } = raw;
  void _omit;
  if (!verifyObject(unsealedRaw, r.publicKey.jwk, r.chotam.sig)) {
    reasons.push("self-seal signature is invalid");
  }

  // shem ↔ shaliach consistency.
  try {
    const shem = parseShem(r.shem);
    if (shem.name !== r.shaliach.name) reasons.push("shem name != shaliach.name");
    if (shem.parashah.join(".") !== r.shaliach.parashah.join(".")) {
      reasons.push("shem parashah != shaliach.parashah");
    }
    if (deriveDid(shem) !== r.shaliach.id) reasons.push("shaliach.id is not the did of shem");
  } catch (err) {
    reasons.push(`shem is unparseable: ${(err as Error).message}`);
  }

  const expired = r.meta.expiresAt !== undefined && new Date(r.meta.expiresAt).getTime() < now.getTime();
  const ok = reasons.length === 0;
  return { ok, level: ok ? "self" : "invalid", reasons, expired };
}
