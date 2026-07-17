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

RUN bun install --frozen-lockfile --production=false

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
ENV VITE_API_URL=$VITE_API_URL

# Build order: shared -> api -> web (enforced by turbo)
RUN bun run build

# ---- Stage 3: API Production Runtime ----
FROM oven/bun:1-slim AS api
WORKDIR /app

RUN addgroup --system --gid 1001 masonart && \
    adduser --system --uid 1001 --ingroup masonart appuser

COPY --from=builder --chown=appuser:masonart /app/packages/api/dist ./packages/api/dist
COPY --from=builder --chown=appuser:masonart /app/packages/api/package.json ./packages/api/
COPY --from=builder --chown=appuser:masonart /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=appuser:masonart /app/packages/shared/package.json ./packages/shared/
COPY --from=builder --chown=appuser:masonart /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:masonart /app/package.json ./

USER appuser

EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://localhost:3000/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["bun", "run", "packages/api/dist/index.js"]

# ---- Stage 4: Web Production Runtime ----
FROM node:20-slim AS web
WORKDIR /app

RUN addgroup --system --gid 1001 masonart && \
    adduser --system --uid 1001 --ingroup masonart appuser

COPY --from=builder --chown=appuser:masonart /app/packages/web/.output ./.output
COPY --from=builder --chown=appuser:masonart /app/packages/web/package.json ./

USER appuser

EXPOSE 3001
ENV NODE_ENV=production
ENV PORT=3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3001').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", ".output/server/index.mjs"]
