import type { Reshuma } from "@sefer/core";
import { keyOf, type ReshumaStore } from "./store";

/**
 * In-memory ReshumaStore — the default for development and tests. A SQLite/Postgres
 * adapter implementing the same interface lands in a later increment (see ROADMAP).
 */
export class InMemoryReshumaStore implements ReshumaStore {
  private readonly records = new Map<string, Reshuma>();

  async put(record: Reshuma): Promise<void> {
    this.records.set(keyOf(record), record);
  }

  async get(key: string): Promise<Reshuma | null> {
    return this.records.get(key) ?? null;
  }

  async delete(key: string): Promise<boolean> {
    return this.records.delete(key);
  }

  async all(): Promise<Reshuma[]> {
    return [...this.records.values()];
  }

  /** Number of inscribed records (test/diagnostic helper). */
  get size(): number {
    return this.records.size;
  }
}
