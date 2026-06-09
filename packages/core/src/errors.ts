/**
 * All Sefer errors carry a stable machine-readable `code` so callers can branch on
 * failure kind without string-matching messages.
 */
export class SeferError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SeferError";
    this.code = code;
  }
}

/** A shem address string was malformed. */
export class ShemParseError extends SeferError {
  constructor(message: string) {
    super("ERR_SHEM_PARSE", message);
    this.name = "ShemParseError";
  }
}

/** Canonicalization hit an unsupported value (non-finite number, bigint, etc.). */
export class CanonicalError extends SeferError {
  constructor(message: string) {
    super("ERR_CANONICAL", message);
    this.name = "CanonicalError";
  }
}

/** A reshumah failed structural or cryptographic validation. */
export class ReshumaError extends SeferError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = "ReshumaError";
  }
}
