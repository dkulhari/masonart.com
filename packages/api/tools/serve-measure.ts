/**
 * Serve the room-measure tool and a folder of room images on localhost, so
 * the /room-mockup skill can open the tool in Chrome and load a room by URL.
 *
 * A file:// page cannot be driven by the browser extension and cannot fetch
 * a room image, so the tool needs an origin. This is that origin and nothing
 * else: two routes, read-only, bound to 127.0.0.1.
 *
 *   GET /                 the tool (tools/room-measure.html)
 *   GET /rooms/<file>     a file from the rooms folder
 *
 * Usage:
 *   bun run packages/api/tools/serve-measure.ts [roomsDir] [--port 8765]
 *
 * roomsDir defaults to packages/api/src/database/room-templates.
 */

import { existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const TOOL = join(here, 'room-measure.html');
const DEFAULT_ROOMS = join(here, '../src/database/room-templates');

const argv = process.argv.slice(2);
const portIx = argv.indexOf('--port');
const port = portIx >= 0 ? Number(argv[portIx + 1]) : 8765;
const roomsDir = resolve(argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--port') ?? DEFAULT_ROOMS);

if (!existsSync(roomsDir)) {
  console.error(`rooms folder does not exist: ${roomsDir}`);
  process.exit(1);
}

const server = Bun.serve({
  hostname: '127.0.0.1',
  port,
  fetch(req) {
    const { pathname } = new URL(req.url);

    if (pathname === '/' || pathname === '/room-measure.html') {
      return new Response(Bun.file(TOOL), { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }

    if (pathname.startsWith('/rooms/')) {
      // basename() strips any path the client tries to smuggle in.
      const file = join(roomsDir, basename(decodeURIComponent(pathname.slice('/rooms/'.length))));
      if (!existsSync(file)) return new Response('not found', { status: 404 });
      return new Response(Bun.file(file));
    }

    return new Response('not found', { status: 404 });
  },
});

console.log(`room-measure at http://127.0.0.1:${server.port}/  rooms from ${roomsDir}`);
