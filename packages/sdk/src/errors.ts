/** A non-2xx HTTP response from a Sofer. */
export class SeferHttpError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string) {
    super(`Sofer responded ${status}: ${body}`);
    this.name = "SeferHttpError";
    this.status = status;
    this.body = body;
  }
}

/** A resolved/discovered record failed local chotam verification — never trust it. */
export class SeferVerificationError extends Error {
  readonly reasons: string[];

  constructor(shem: string, reasons: string[]) {
    super(`reshumah for ${shem} failed verification: ${reasons.join("; ")}`);
    this.name = "SeferVerificationError";
    this.reasons = reasons;
  }
}
