---
name: room-mockup
description: Turn one room photo into room mockups for a folder of posters. Opens the click tool in the user's Chrome, the user marks where the poster hangs, the agent reads the marks off the page, renders one preview for approval, then renders the batch. Use when the user says "room mockup", "put the posters in this room", "measure this room", or gives a room photo and a posters folder.
allowed-tools:
  - Bash
  - Read
  - Write
  - AskUserQuestion
  - mcp__claude-in-chrome__tabs_context_mcp
  - mcp__claude-in-chrome__tabs_create_mcp
  - mcp__claude-in-chrome__tabs_close_mcp
  - mcp__claude-in-chrome__navigate
  - mcp__claude-in-chrome__computer
  - mcp__claude-in-chrome__javascript_tool
---

# /room-mockup — room photo → measured scene → mockups

The renderer (`packages/api/src/lib/room-mockup/`, driver `mockups:rooms`) is
deterministic. The one thing it cannot do is decide where on the wall the
poster hangs. A person clicks that. This skill runs that hand-off through the
user's own browser, so nothing is eyeballed by the agent and nothing is
downloaded and pasted by the user.

**Never guess corners.** If the user is not available to click, stop and say so.

## Arguments

```
$ARGUMENTS: <room-image> [--id <slug>] [--posters <dir>] [--frame <slug>] [--out <dir>]
```

- `room-image`: a PNG/JPG, long edge ≥ 2048 recommended. Ask if missing.
- `--id`: scene slug, `[a-z0-9-]+`. Default: the image's basename, slugified.
- `--posters`: folder of poster images. Ask before step 6 if missing.
- `--frame`: a key of `packages/api/src/database/frame-renders.json` (`black`, `wood`, `white`, `gold`, `silver`, `frameless`). Default `black`.
- `--out`: output folder. Default `.cache/room-mockup/<id>/`.

## Steps

### 1. Stage the room

```bash
T=packages/api/src/database/room-templates
cp "<room-image>" "$T/room-<id>.<ext>"
```

Check the size with `bun -e` + sharp and warn if the long edge is under 2048 px
(the poster box must be ≥ 400 px wide on the image, or the scene is rejected).

### 2. Serve the tool

```bash
bun run packages/api/tools/serve-measure.ts   # background; serves http://127.0.0.1:8765/
```

Rooms folder defaults to `room-templates`. Pass another folder as the first
argument if the room lives elsewhere. Use `--port` if 8765 is taken.

### 3. Open it in the user's Chrome

1. `tabs_context_mcp` with `createIfEmpty: true`, then `tabs_create_mcp`.
2. `navigate` to `http://127.0.0.1:8765/?image=rooms/room-<id>.<ext>&mode=box&id=<id>`.
3. `computer` screenshot once to confirm the image loaded (the panel says
   "natural size W × H px"). Do not click on the canvas yourself.

### 4. Ask the user to mark the poster box

Say exactly this, then wait for the user's reply:

> In the Chrome tab, click the four corners of where the framed poster should
> hang: top-left, top-right, bottom-right, bottom-left. Drag a dot to adjust;
> arrow keys nudge it. The white grid should lie flat on the wall. When the
> checks on the right are all green, tell me "done".

If they want a straight-on hang, the box is snapped to a rectangle for them.
If the wall is angled, the tool sets the yaw from the box; they can untick
"yaw from the box" and type one.

### 5. Read the scene off the page

`javascript_tool`:

```js
({ json: document.getElementById('out').value,
   bad: [...document.querySelectorAll('#checks li.bad')].map(li => li.textContent) })
```

- If `bad` is not empty: read the failing checks back to the user in plain
  words and go back to step 4. Do not save.
- Else `Write` the JSON to `packages/api/src/database/room-templates/room-<id>.json`.

### 6. Preview for approval

Pick one poster from `--posters` (the first portrait one if any) and run:

```bash
cd packages/api
bun run src/database/dump-room-steps.ts "<poster>" ".cache/room-mockup/<id>/preview" \
  --scene src/database/room-templates/room-<id>.json --frame <frame>
```

Show the user `preview/0b-scene-overlay-stage2.png` (the box and grid on the
photo) and `preview/5-final-stage5.jpg` (the poster hung). Use `Read` to look
at both yourself first. Ask: "ok, or again?". On "again", go to step 4; the
tool still has their corners, they only drag.

### 7. Render the batch

```bash
bun run --cwd packages/api mockups:rooms --posters "<posters>" --only <id> --frame <frame> --out "<out>"
```

Report: how many posters, where the output is, and that each poster folder
has `room-<id>.jpg`, `framed-main.jpg` and `contact-sheet.jpg`.

### 8. Clean up

`tabs_close_mcp` the tab. Kill the server you started. Tell the user the
scene file path; it is the only thing worth committing besides the room
image.

## When it refuses

| Message | Meaning |
|---|---|
| `below the 400 px floor` | Box too small on the image. Bigger box, or a larger room image. |
| `declares yawDeg 0 ... not a rectangle` | The user unticked "yaw from the box" and typed 0 on a leaning box. Tick it again. |
| `negative yaw ... left edge is not longer` | Typed yaw disagrees with the box. Tick "yaw from the box". |
| `Could not load rooms/...` in the panel | The server's rooms folder is not where the image is. Restart it with that folder. |
