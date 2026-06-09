/**
 * base64url helpers. Core targets Node (it needs node:crypto for Ed25519 anyway), so
 * these lean on Buffer. A future browser build can swap in a WebCrypto-based shim.
 */

export function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

export function fromBase64url(text: string): Buffer {
  return Buffer.from(text, "base64url");
}
