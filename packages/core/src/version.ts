/**
 * The Sefer protocol version. Embedded in (and signed as part of) every reshumah.
 * Minor versions are additive and backward-compatible; see docs/PROTOCOL.md §6.
 */
export const SEFER_PROTOCOL_VERSION = "sefer/0.1" as const;

export type SeferProtocolVersion = typeof SEFER_PROTOCOL_VERSION;
