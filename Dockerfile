# ============================================
# MasonArt Production Dockerfile
# Multi-stage build for API and Web services
# ============================================

# ---- Stage 1: Install dependencies ----
FROM oven/bun:1 AS deps
WORKDIR /app

COPY package.json bun.lock turbo.json ./
COPY packages/api/package.json ./packages/api/
COPY packages/web/package.json ./packages/web/
COPY packages/shared/package.json ./packages/shared/

# No --production: devDependencies are needed to build (and newer bun
# rejects the old --production=false spelling outright).
RUN bun install --frozen-lockfile

# ---- Stage 2: Build all packages ----
FROM oven/bun:1 AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/api/node_modules ./packages/api/node_modules
COPY --from=deps /app/packages/web/node_modules ./packages/web/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

COPY package.json turbo.json tsconfig.json ./
COPY packages/shared ./packages/shared
COPY packages/api ./packages/api
COPY packages/web ./packages/web

# Baked into the browser bundle at build time. Default "" = same-origin
# (relative) API URLs — the production ingress routes /api/* to the api
# container, so an image built without the arg is safe by default (cc #96).
ARG VITE_API_URL=""
ARG VITE_CDN_URL=""
ARG VITE_SENTRY_DSN=""
ENV VITE_API_URL=$VITE_API_URL \
    VITE_CDN_URL=$VITE_CDN_URL \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN

# Build order: shared -> api -> web (enforced by turbo)
RUN bun run build

# ---- Stage 3: API Production Runtime ----
FROM oven/bun:1-slim AS api
WORKDIR /app

# Run as the image's built-in non-root `bun` user (uid 1000) — the slim
# base no longer ships adduser/addgroup, so creating a custom user fails.

COPY --from=builder --chown=bun:bun /app/packages/api/dist ./packages/api/dist
COPY --from=builder --chown=bun:bun /app/packages/api/package.json ./packages/api/
# Schema migrations ship in the image: the mini has no repo checkout, so
# `make migrate` runs drizzle-kit against these in-container. db:push is
# never used against prod (cc #93). package-local node_modules carries the
# drizzle-kit binary (.bin symlinks resolve into the root store below).
COPY --from=builder --chown=bun:bun /app/packages/api/drizzle.config.ts ./packages/api/
COPY --from=builder --chown=bun:bun /app/packages/api/src/database/migrations ./packages/api/src/database/migrations
COPY --from=builder --chown=bun:bun /app/packages/api/node_modules ./packages/api/node_modules
COPY --from=builder --chown=bun:bun /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=bun:bun /app/packages/shared/package.json ./packages/shared/
COPY --from=builder --chown=bun:bun /app/node_modules ./node_modules
COPY --from=builder --chown=bun:bun /app/package.json ./

USER bun

EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://localhost:3000/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["bun", "run", "packages/api/dist/index.js"]

# ---- Stage 4: Web Production Runtime (Bun serves the SSR fetch handler) ----
FROM oven/bun:1-slim AS web
WORKDIR /app

# The server bundle keeps react/react-dom/@tanstack imports external, so it
# needs real node_modules — and module resolution walks up from the FILE's
# path, so keep the workspace layout: dist under packages/web/ next to its
# per-package node_modules (same pattern as the api stage; proven in
# customs-copilot's web image).
COPY --from=builder --chown=bun:bun /app/packages/web/dist ./packages/web/dist
COPY --from=builder --chown=bun:bun /app/packages/web/serve.ts ./packages/web/
COPY --from=builder --chown=bun:bun /app/packages/web/package.json ./packages/web/
COPY --from=builder --chown=bun:bun /app/packages/web/node_modules ./packages/web/node_modules
COPY --from=builder --chown=bun:bun /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=bun:bun /app/packages/shared/package.json ./packages/shared/
COPY --from=builder --chown=bun:bun /app/node_modules ./node_modules
COPY --from=builder --chown=bun:bun /app/package.json ./

USER bun

EXPOSE 3001
ENV NODE_ENV=production
ENV PORT=3001
ENV BUN_PORT=3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://localhost:3001').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["bun", "run", "packages/web/serve.ts"]
