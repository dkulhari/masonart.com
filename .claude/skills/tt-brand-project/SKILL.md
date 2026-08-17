---
name: tt-brand-project
description: Give this project's ticketrack instance its own tab icon and name. Use when the user says change the favicon, brand the tracker, set a project icon or logo, or every tracker tab looks identical and they cannot tell projects apart.
allowed-tools:
  - Bash
  - Read
---

# /tt-brand-project — Per-Project Tracker Identity

Every ticketrack instance runs the same `tracker-unified` image, so by default
every browser tab looks alike. Identity is per-project data, not a per-project
build — nothing here needs an image rebuild.

Three sources, highest first:

| Source | What it gives | Needs |
|---|---|---|
| Files in `<tracker-data>/branding/` | Real artwork, all platforms | 5 image files + restart |
| `PROJECT_ICON` env | One emoji as the tab icon | compose edit + restart |
| Auto-generated tile | Initial on a name-hashed colour | nothing, always on |

`PROJECT_NAME` sets the tab title and header text independently of all three.

Ask which the user wants if it is not obvious: emoji is 30 seconds, artwork
needs files they must supply. Do not invent artwork.

## Route A — real icons

### 1. Locate the mounted tracker-data directory

```bash
grep -n "app/data" docker-compose.ticketrack.yml
# e.g.  - ${TRACKER_DATA_PATH:-./plan/tracker-data}:/app/data:rw
```

The host side of that mount is `<tracker-data>`. Branding lives in
`<tracker-data>/branding/`.

### 2. Place the files

Exactly these five names are recognised — nothing else in the directory is
served, and no other path on the volume is reachable:

```
plan/tracker-data/branding/
├── favicon.ico
├── icon.svg
├── apple-touch-icon.png   (180x180)
├── icon-192.png
└── icon-512.png
```

**Partial sets are fine.** Each name falls back on its own: a directory holding
only `icon.svg` serves that SVG and leaves the other four on the built-in
ticketrack icons. A misspelled name is ignored silently — it is not an error,
the default just keeps showing.

### 3. Restart — required after adding or removing files

Presence is detected once at boot and cached, so a new directory is invisible
until the container restarts. Run `/tt-restart`, or:

```bash
docker compose -f docker-compose.ticketrack.yml up -d --force-recreate
```

Replacing the *contents* of a file already there takes effect immediately — only
the file list is cached. No restart needed for a redraw.

### 4. Verify

```bash
curl -s "http://localhost:${PORT}/api/version"   # want "brandingOverride": true
```

`true` means the server found at least one file and the UI has stood its
generated favicon down. Then hard-reload the browser: `/favicon.ico` is cached
aggressively and a soft reload usually shows the old icon.

## Route B — emoji or name only

Edit the project's `docker-compose.ticketrack.yml`:

```yaml
    environment:
      - PROJECT_NAME=customs-copilot   # tab title + header
      - PROJECT_ICON=🚢                # one emoji, ≤8 code units, optional
```

Then `/tt-restart`. With no `PROJECT_NAME`, identity falls back to
`basename(PROJECT_DIR_HOST)`, then to `ticketrack`.

A mounted `branding/` outranks `PROJECT_ICON` — set the emoji and the icon
files will still win. Remove the files and restart to fall back to the emoji.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `brandingOverride: false` with files present | Directory sits beside the mount, not inside it, or no restart yet. Re-check step 1. |
| `brandingOverride: true`, tab unchanged | Browser favicon cache. Hard reload. |
| Some icons branded, some not | Working as designed — per-name fallback. Check for a misspelled filename. |
| Emoji ignored | A `branding/` directory exists and outranks it. |
| Nothing changed after editing compose | Compose env is read at container create. `/tt-restart`, not `docker restart`. |

## Output

```
🎨 Branding applied — {project}
  Route:     {mounted icons | emoji | name only}
  Files:     {n}/5 present ({names})
  Override:  {brandingOverride from /api/version}
  URL:       http://localhost:{port}  (hard-reload to see it)
```

## Reference

Design rationale, the serving-order decision, and the security reason the
filename list is fixed: `plan/docs/ai-tracker-guide-mcp.md`, section
"Per-Project Favicon Branding" — in the ticketrack repo, not this one.
