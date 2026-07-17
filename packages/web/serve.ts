/**
 * Production web entry (Bun).
 *
 * @tanstack/react-start 1.149's server bundle exports only the SSR fetch
 * handler — unlike ≥1.168 it does not serve the client build. This wrapper
 * serves dist/client (assets, images, robots.txt) and delegates everything
 * else to SSR. Run with: bun run serve.ts (cwd-independent).
 */
import { join, normalize } from "node:path";
// @ts-expect-error built artifact, present in the production image
import handler from "./dist/server/server.js";

const clientDir = join(import.meta.dir, "dist", "client");
const port = Number(process.env.PORT ?? 3001);

Bun.serve({
  port,
  async fetch(req) {
    if (req.method === "GET" || req.method === "HEAD") {
      const { pathname } = new URL(req.url);
      const filePath = normalize(join(clientDir, decodeURIComponent(pathname)));
      // normalize() collapses any ../ — anything escaping clientDir falls
      // through to SSR instead of the filesystem.
      if (pathname !== "/" && filePath.startsWith(clientDir + "/")) {
        const file = Bun.file(filePath);
        if (await file.exists()) {
          return new Response(file, {
            headers: pathname.startsWith("/assets/")
              ? { "cache-control": "public, max-age=31536000, immutable" }
              : { "cache-control": "public, max-age=3600" },
          });
        }
      }
    }
    return handler.fetch(req);
  },
});

console.log(`web: serving dist/client + SSR on :${port}`);
