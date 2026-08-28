/**
 * Drizzle migration-meta integrity (#623)
 *
 * `drizzle-kit generate` diffs the TypeScript schema against the LAST
 * snapshot in `migrations/meta/` (drizzle-kit sorts the meta directory
 * lexicographically and takes the tail). It picks the number for the new
 * migration from the journal instead. So when snapshots fall behind the
 * journal, generate replays every intervening migration as fresh drift and
 * prompts for renames nobody asked for -- which is exactly what made
 * `bun run db:generate` unusable in this repo.
 *
 * These are pure filesystem checks: no database, no drizzle-kit invocation.
 * They pin the three invariants that keep generate honest.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS_DIR = join(__dirname, "../../src/database/migrations");
const META_DIR = join(MIGRATIONS_DIR, "meta");

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface Journal {
  version: string;
  dialect: string;
  entries: JournalEntry[];
}

interface Snapshot {
  id: string;
  prevId: string;
  version: string;
  dialect: string;
}

const journal: Journal = JSON.parse(
  readFileSync(join(META_DIR, "_journal.json"), "utf-8"),
);

/** `0014` -> `0014_snapshot.json`, the name drizzle-kit writes. */
const snapshotName = (idx: number) =>
  `${String(idx).padStart(4, "0")}_snapshot.json`;

const readSnapshot = (idx: number): Snapshot =>
  JSON.parse(readFileSync(join(META_DIR, snapshotName(idx)), "utf-8"));

describe("drizzle migration meta (#623)", () => {
  it("has a snapshot for every journal entry", () => {
    const missing = journal.entries
      .filter((entry) => !existsSync(join(META_DIR, snapshotName(entry.idx))))
      .map((entry) => `${snapshotName(entry.idx)} (${entry.tag})`);

    expect(missing).toEqual([]);
  });

  it("has a journal entry and a snapshot for every migration file", () => {
    const sqlTags = readdirSync(MIGRATIONS_DIR)
      .filter((name) => name.endsWith(".sql"))
      .map((name) => name.replace(/\.sql$/, ""))
      .sort();
    const journalTags = journal.entries.map((entry) => entry.tag).sort();

    expect(journalTags).toEqual(sqlTags);
  });

  it("chains every snapshot's prevId to the previous snapshot's id", () => {
    const present = journal.entries.filter((entry) =>
      existsSync(join(META_DIR, snapshotName(entry.idx))),
    );

    const breaks: string[] = [];
    for (let i = 1; i < present.length; i++) {
      const prev = readSnapshot(present[i - 1]!.idx);
      const current = readSnapshot(present[i]!.idx);
      if (current.prevId !== prev.id) {
        breaks.push(
          `${snapshotName(present[i]!.idx)}.prevId=${current.prevId} !== ` +
            `${snapshotName(present[i - 1]!.idx)}.id=${prev.id}`,
        );
      }
    }

    expect(breaks).toEqual([]);
  });

  it("gives every snapshot a unique id, so no two claim the same parent", () => {
    const ids = journal.entries
      .filter((entry) => existsSync(join(META_DIR, snapshotName(entry.idx))))
      .map((entry) => readSnapshot(entry.idx).id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ends the snapshot chain on the newest journal entry", () => {
    const snapshotIndexes = readdirSync(META_DIR)
      .filter((name) => /^\d{4}_snapshot\.json$/.test(name))
      .map((name) => Number(name.slice(0, 4)))
      .sort((a, b) => a - b);
    const newestJournalIdx = Math.max(
      ...journal.entries.map((entry) => entry.idx),
    );

    expect(snapshotIndexes.at(-1)).toBe(newestJournalIdx);
  });
});
