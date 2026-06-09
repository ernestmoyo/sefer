import type { Reshuma } from "@sefer/core";

/**
 * The storage key for a reshumah is its parashah + name (version/capability are not part
 * of identity in v0.1 — latest inscription wins). e.g. `["acme","maps"], "geocoder"`
 * → `"acme.maps.geocoder"`.
 */
export function storeKey(parashah: readonly string[], name: string): string {
  return [...parashah, name].join(".");
}

/** The storage key for a full record. */
export function keyOf(record: Reshuma): string {
  return storeKey(record.shaliach.parashah, record.shaliach.name);
}

/**
 * Persistence boundary for reshumot (Repository pattern). Implementations swap storage
 * (in-memory, SQLite, Postgres…) without the Sofer logic changing. Inscription is
 * upsert-by-key; deletion is a tombstone the adapter decides how to represent.
 */
export interface ReshumaStore {
  put(record: Reshuma): Promise<void>;
  get(key: string): Promise<Reshuma | null>;
  delete(key: string): Promise<boolean>;
  all(): Promise<Reshuma[]>;
}
