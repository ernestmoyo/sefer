import { ShemParseError } from "./errors";

/**
 * A parsed shem (agent address). Read left→right broad→specific: the last label is the
 * agent name; preceding labels form the parashah (namespace). See docs/PROTOCOL.md §1.
 */
export interface Shem {
  /** Namespace labels, broad→specific. Empty array = the root parashah. */
  readonly parashah: readonly string[];
  /** The agent's local name (the last label). */
  readonly name: string;
  /** Optional semver / range selector, e.g. "1.4.0" or "^1.2". */
  readonly version?: string;
  /** Optional capability id selector (the `#fragment`). */
  readonly capability?: string;
}

const SCHEME = "shem://";
const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const CAPABILITY_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const VERSION_RE = /^[0-9A-Za-z.\-+^~*x|<>= ]{1,64}$/;
const MAX_LABEL = 63;
const MAX_LABELS_TOTAL = 255;

/** True if `label` is a valid, already-lowercased shem label. */
export function isValidLabel(label: string): boolean {
  return label.length >= 1 && label.length <= MAX_LABEL && LABEL_RE.test(label);
}

/**
 * Parse a shem string into its parts. Input is case-insensitive and normalized to
 * lowercase. Throws {@link ShemParseError} on any malformed input.
 */
export function parseShem(input: string): Shem {
  if (typeof input !== "string") {
    throw new ShemParseError("shem must be a string");
  }
  let rest = input.trim();
  if (rest.length === 0) throw new ShemParseError("shem is empty");

  if (rest.startsWith(SCHEME)) rest = rest.slice(SCHEME.length);

  // Split capability fragment (#cap) first, then version (@ver), then labels.
  let capability: string | undefined;
  const hashAt = rest.indexOf("#");
  if (hashAt >= 0) {
    capability = rest.slice(hashAt + 1).toLowerCase();
    rest = rest.slice(0, hashAt);
    if (!CAPABILITY_RE.test(capability)) {
      throw new ShemParseError(`invalid capability selector: "${capability}"`);
    }
  }

  let version: string | undefined;
  const atAt = rest.indexOf("@");
  if (atAt >= 0) {
    version = rest.slice(atAt + 1);
    rest = rest.slice(0, atAt);
    if (!VERSION_RE.test(version)) {
      throw new ShemParseError(`invalid version selector: "${version}"`);
    }
  }

  if (rest.length === 0) throw new ShemParseError("shem has no name");
  if (rest.length > MAX_LABELS_TOTAL) {
    throw new ShemParseError(`shem label set exceeds ${MAX_LABELS_TOTAL} characters`);
  }

  const labels = rest.toLowerCase().split(".");
  for (const label of labels) {
    if (!isValidLabel(label)) {
      throw new ShemParseError(`invalid label: "${label}"`);
    }
  }

  const name = labels[labels.length - 1] as string;
  const parashah = labels.slice(0, -1);

  const shem: Shem = { parashah, name };
  return version !== undefined
    ? capability !== undefined
      ? { ...shem, version, capability }
      : { ...shem, version }
    : capability !== undefined
      ? { ...shem, capability }
      : shem;
}

/** Serialize a shem back to canonical string form. */
export function serializeShem(shem: Shem, opts: { scheme?: boolean } = {}): string {
  const labels = [...shem.parashah, shem.name];
  for (const label of labels) {
    if (!isValidLabel(label)) {
      throw new ShemParseError(`invalid label in shem: "${label}"`);
    }
  }
  let out = labels.join(".");
  if (shem.version !== undefined) out += "@" + shem.version;
  if (shem.capability !== undefined) out += "#" + shem.capability;
  return opts.scheme === false ? out : SCHEME + out;
}

/** The parashah as a dotted string, e.g. `["acme","maps"] → "acme.maps"`. */
export function parashahString(shem: Shem): string {
  return shem.parashah.join(".");
}
