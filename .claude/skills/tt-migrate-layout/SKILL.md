---
name: tt-migrate-layout
description: Migrate this project's tracker store from the status-directory layout (todo/, in-progress/, done/) to the flat tickets/ layout. Use when the tracker reads empty after a ticketrack image update, or when the user says migrate the layout, flatten the store, or run the flat-layout migration.
allowed-tools:
  - Bash
  - Read
  - mcp__ticketrack__checkIntegrity
---

# /tt-migrate-layout — Flatten This Project's Tracker Store

Moves every `plan/tracker-data/<status>/feature-<name>/ticket-NNNN-*.yaml` into
`plan/tracker-data/tickets/ticket-NNNN-*.yaml`, drops the per-status
`feature.yaml` links, and removes the emptied directories (#335).

Status stops being the containing directory and becomes only the `status:`
field inside the YAML — which is where it always really lived.

**The container supplies the code. The host supplies git.** The tracker image
carries `migrate-flat-layout.js` but no `git` binary and no view of the repo;
the host has the repo but not the script. So the script runs in a one-shot
container and every git operation runs on the host, around it.

## Read this before running anything

### The empty window is expected, not data loss

Rollout order is **image first, then data**. A project that has picked up the
new image but not yet run this skill has a tracker that reads **empty** — new
code looks in `tickets/`, the tickets are still in `todo/`. Nothing is lost,
nothing is broken, and this skill is the thing that closes the window.

If the user is alarmed by an empty board, say this first.

### Interruption does not corrupt, but does not leave

Every action is a single `rename(2)`. There is no journal and no partial file
state: each ticket is either at its old path or its new one. Re-running the
migration finishes whatever remains.

But **between an interruption and the re-run, nothing may write to the store.**
Old code and new code each see one half of a split corpus and each report it as
the whole truth. Keep the container down until the re-run completes.

### Revert

```bash
git checkout -- plan/tracker-data && git clean -fd plan/tracker-data
```

Then redeploy the previously tagged image. This is why Step 2 exists: untracked
ticket files are the only part git cannot roll back.

Generated files — `.index.json`, `STATUS-*.yaml`, `DEPENDENCIES.yaml` — are
gitignored. **Regenerate them, do not try to restore them.**

## Steps

Run them in this order. Do not reorder, do not skip.

### 1. Integrity check — refuse to continue on any blocker

```
mcp__ticketrack__checkIntegrity({ json: true })
```

Read the issues in the report and classify them by `kind`. **Do not gate on the
warning count.**

- **Any error → stop.** Report them; they are fixed by hand, not by this skill.
- **`uncommitted-tracker-data` → stop.** The only warning that obstructs a
  migration. Step 2 is what clears it, so in practice this means "do Step 2
  first"; if it survives Step 2, something outside the data dir is dirty and
  needs a human.
- **Every other warning → report and continue.** Three kinds make up almost all
  of them, and none is an obstacle:
  - `feature-link-is-copy` — a per-status `feature.yaml` that is a real file
    rather than a symlink. The migration **deletes** these. Blocking on a
    condition the migration resolves is circular.
  - `stray-non-ticket-file` — a `README.md` or `CLAUDE.md` inside a feature
    directory. The migration deliberately keeps those directories and Step 4
    names each one. Expected, not a fault.
  - `feature-file-without-tickets` — a registered feature with no tickets.
    Nothing to do with layout.

Counting rather than classifying is what an earlier version of this step did,
and it could never pass: on ticketrack's own store, a fully repaired corpus
still reports ~25 warnings of exactly those three kinds. Every project will
look like that.

The pre-migration checks (#340) live in this same report, and the ones that
decide safety are **errors** — `feature-copy-holds-unique-content`,
`name-collision`, `ticket-status-mismatch`, `feature-link-target-missing`,
`unreadable-ticket`. A clean *error* run here is the precondition for
everything below.

If MCP is unreachable, the same check runs in the container:

```bash
docker run --rm -v "$PWD:/work" --entrypoint node tracker-unified:latest \
  /app/packages/scripts/dist/check-integrity.js --data-dir /work/plan/tracker-data --strict
```

### 2. Commit the store as it stands

```bash
git add -A plan/tracker-data && git commit -m "chore: snapshot tracker-data before flat-layout migration"
```

**Load-bearing, not housekeeping.** Untracked ticket files are invisible to
`git checkout`; staging them is what makes Step 5 revertible. Nothing to commit
is a fine outcome — it means everything was already tracked.

### 3. Stop every writer

```bash
docker compose -f docker-compose.ticketrack.yml down
```

The script's own `.tracker-write.lock` check is TOCTOU: it proves only that
nothing was writing at plan time. Taking the container down is what actually
holds.

Note that the MCP server runs locally against `plan/tracker-data` and keeps
working with the container down — that is fine for reads, but do not issue
tracker writes between here and Step 7.

### 4. Dry run, and show the plan

First confirm the image is new enough to carry the migration script. Images
built before #335 have `/app/packages/scripts/dist` but not this file, and the
failure reads as a confusing `MODULE_NOT_FOUND` rather than "wrong image":

```bash
docker run --rm --entrypoint sh tracker-unified:latest \
  -c 'ls /app/packages/scripts/dist/migrate-flat-layout.js'
```

Missing → stop. Rebuild in the ticketrack repo (`make build`) and redeploy
before going further.

```bash
docker run --rm -v "$PWD:/work" --entrypoint node tracker-unified:latest \
  /app/packages/scripts/dist/migrate-flat-layout.js \
  --data-dir /work/plan/tracker-data --allow-plain-rename
```

Two flags carry weight here:

- `--entrypoint node` is **required**. `docker-entrypoint.sh` dispatches on
  `SERVICE` and exits 1 on any command it does not recognise.
- `--allow-plain-rename` is **required in the container**, where `git` is not
  installed. Without it the plan reports a `git-unavailable` blocker and
  refuses. The flag costs nothing: git does not store renames, it detects them
  at diff time from content, and these files move byte-identically — so a plain
  rename plus the host-side `git add -A` in Step 6 stages exactly what `git mv`
  would have.

Dry run is the default; there is no `--dry-run` to remember.

**Show the user the plan and the counts before applying.** Any blocker means
stop — bring the container back up (Step 7) and report.

#### If the blockers are `feature-copy-holds-unique-content`

The check compares by MEANING, not by key path (#346). Two classes of
difference are never reported, because both are derived from the tickets on
disk and a copy disagreeing with a freshly repaired central file is stale by
definition rather than the last record of anything:

```
tickets.<bucket>.<n>     — a ticket present in ANY central bucket is present
total_tickets            completion_percentage
is_completed             work_session_summary.*
```

So running `repair-feature-rollups --apply` first can only lower this count,
never raise it. Before #346 it raised it — a ticket the repair moved into the
right bucket read as content the central file lacked — and on ticketrack that
took the count from 6 blockers to 11.

What still blocks is a **non-derived** field the central file lacks or
disagrees with, which is a real decision and belongs to the user, not to this
skill. On ticketrack the only such case across 44 copies was one feature
holding `priority: critical` where the central file said `high`.

Do not delete copies in bulk without showing the user the audit.

### 5. Apply

```bash
docker run --rm -v "$PWD:/work" --entrypoint node tracker-unified:latest \
  /app/packages/scripts/dist/migrate-flat-layout.js \
  --data-dir /work/plan/tracker-data --allow-plain-rename --apply
```

Expect a final line of the form
`✅ moved N ticket(s), dropped N feature link(s), removed N directory(ies)`.

**Surviving `todo/` or `done/` directories are not a failure.** A feature
directory holding a non-ticket file — a `README.md`, a stray `CLAUDE.md` — is
kept, and the dry run named each one as a warning. Nothing else should remain.

If this is interrupted, re-run the same command. See "Interruption" above.

### 6. Stage and review

```bash
git add -A plan/tracker-data
git diff --cached --stat
```

Every ticket should appear as a rename. Show the stat to the user. Do not
commit without approval.

### 7. Restart the tracker

Run `/tt-restart`, then confirm the board is populated again.

## Refusal rules

Stop and report, rather than working around, when:

- `checkIntegrity` reports any error, or an `uncommitted-tracker-data` warning
  that Step 2 did not clear (Step 1). Other warning kinds are reported, not
  refused on.
- The dry run reports any blocker (Step 4)
- `docker-compose.ticketrack.yml` is absent — this project has no tracker to migrate
- `tracker-unified:latest` is missing locally — build it in the ticketrack repo first
- `plan/tracker-data/tickets/` already exists and holds tickets — the migration
  has already run; re-running is a no-op, but confirm with the user first

## Output

```
📦 flat-layout migration — {project}
  Integrity:  {errors} error(s), {warnings} warning(s)
  Snapshot:   {commit-hash | nothing to commit}
  Planned:    {N} move(s), {N} link(s) dropped, {N} dir(s) removed
  Applied:    {N} moved
  Staged:     {N} file(s) — awaiting your review
  Tracker:    {healthy | down}
```
