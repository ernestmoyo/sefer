/**
 * The Sefer protocol version a freshly minted reshumah carries. New records are minted at
 * 0.1 until a feature requires a 0.2-only body field; counter-seals are additive (they live
 * outside the signed body), so a 0.1 record can still be vouched. See docs/PROTOCOL.md §6.
 */
export const SEFER_PROTOCOL_VERSION = "sefer/0.1" as const;

/**
 * Versions this build can verify. Per PROTOCOL §6, a verifier MUST accept any `sefer/0.x`
 * it structurally understands and ignore unknown fields — so the schema accepts this set,
 * not a single literal. This is what makes 0.2 additive rather than a breaking change to
 * deployed 0.1 verifiers.
 */
export const SUPPORTED_PROTOCOL_VERSIONS = ["sefer/0.1", "sefer/0.2"] as const;

export type SeferProtocolVersion = (typeof SUPPORTED_PROTOCOL_VERSIONS)[number];
