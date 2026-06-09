/**
 * @sefer/core — the Sefer protocol as code.
 *
 * Names (shem), records (reshumah), capabilities, canonical JSON, and the chotam seal
 * that makes records self-certifying. Pure and dependency-light; no network.
 *
 * See docs/PROTOCOL.md (normative) and docs/ARCHITECTURE.md (reasoning).
 */
export * from "./version";
export * from "./errors";
export * from "./encoding";
export * from "./canonical";
export * from "./address";
export * from "./identity";
export * from "./capability";
export * from "./endpoint";
export * from "./chotam";
export * from "./counterseal";
export * from "./trust";
export * from "./reshumah";
