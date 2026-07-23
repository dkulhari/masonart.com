# Everything runs FROM the dev machine — build, push, render, deploy, and
# the one-time first-boot commands. The mini never runs git/bun/vite and
# never holds prod secrets on disk except inside its Docker credential
# store and the one rendered compose file this pushes over. Pattern
# adopted from customs-copilot deploy/Makefile (cc #88–#93); ingress is
# the shared platform stack in ~/work/customs-copilot/deploy/platform/.
#
# Setup (once):
#   cp deploy/.env.example deploy/.env   # fill in — never commit this file
#   docker login ghcr.io -u <github-username>   # this machine, write:packages
#   make -C deploy login-remote                 # mini, read:packages
#   make -C deploy platform-network             # external network on the mini
#
# Every deploy:
#   make -C deploy build-push-deploy

-include .env
export

REGISTRY       := ghcr.io/dkulhari
API_IMAGE      := $(REGISTRY)/chobi-api
WEB_IMAGE      := $(REGISTRY)/chobi-web
GIT_SHA        := $(shell git -C .. rev-parse --short HEAD)
PLATFORM       := linux/arm64
IMAGE_TAG      ?= latest
SSH            := ssh $(DEPLOY_USER)@$(DEPLOY_HOST)
REMOTE_COMPOSE := ~/chobi-docker-compose.yml
COMPOSE        := docker compose -f docker/docker-compose.prod.yml
# Non-interactive `ssh host "cmd"` only sources .zshenv — Homebrew's PATH
# (where Colima's docker CLI lives) never applies. Prefix every remote
# command so `docker` resolves regardless.
REMOTE_PATH    := export PATH=/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/local/sbin:$$PATH;

.PHONY: login login-remote build push build-push gen-compose deploy \
        build-push-deploy rollback migrate seed seed-admin admin-promote \
        first-boot platform-network ssh-mini clean

login:
	@echo "Run manually: docker login ghcr.io -u <github-username>  (PAT scope: write:packages)"

login-remote:
	$(SSH) "$(REMOTE_PATH) docker login ghcr.io -u <github-username>"
	@echo "^ enter a read:packages PAT on the mini. One-time; persists in its docker credential store."
	@echo "  The mini's ~/.docker/config.json must NOT use credsStore: osxkeychain (unreachable over SSH)."

## --- Build + push linux/arm64 images, tagged latest + git sha ---

# VITE_API_URL="" is REQUIRED on the web target: it bakes same-origin
# (relative) API URLs into the browser bundle — traefik routes /api/* to
# the api container. Omitting it would bake an absolute dev URL into
# production and send every browser API call to the visitor's own
# machine (cc #96). VITE_CDN_URL / VITE_SENTRY_DSN are also build-time.
WEB_BUILD_ARGS := --build-arg VITE_API_URL="" \
                  --build-arg VITE_CDN_URL="$(CDN_URL)" \
                  --build-arg VITE_SENTRY_DSN="$(VITE_SENTRY_DSN)"

build:
	docker buildx build --platform $(PLATFORM) --target api -t $(API_IMAGE):latest -t $(API_IMAGE):$(GIT_SHA) --load ..
	docker buildx build --platform $(PLATFORM) --target web $(WEB_BUILD_ARGS) -t $(WEB_IMAGE):latest -t $(WEB_IMAGE):$(GIT_SHA) --load ..

push:
	docker buildx build --platform $(PLATFORM) --target api -t $(API_IMAGE):latest -t $(API_IMAGE):$(GIT_SHA) --push ..
	docker buildx build --platform $(PLATFORM) --target web $(WEB_BUILD_ARGS) -t $(WEB_IMAGE):latest -t $(WEB_IMAGE):$(GIT_SHA) --push ..
	@echo "Pushed $(API_IMAGE) and $(WEB_IMAGE) tagged latest + $(GIT_SHA)"

build-push: push

## --- Render one fully-resolved compose file (deploy/.env baked in) and
## ship it to the mini. The compose :? guards fire here, at render time ---

gen-compose:
	@test -n "$(REPLICATE_API_TOKEN)$(GOOGLE_AI_STUDIO_KEY)" || \
		(echo "ERROR: set REPLICATE_API_TOKEN and/or GOOGLE_AI_STUDIO_KEY in deploy/.env — AI generation has no provider" && exit 1)
	mkdir -p rendered
	cd .. && IMAGE_TAG=$(IMAGE_TAG) $(COMPOSE) --env-file deploy/.env config --format json > deploy/rendered/docker-compose.yml
	bun -e 'const fs=require("fs");const p="rendered/docker-compose.yml";const d=JSON.parse(fs.readFileSync(p,"utf8"));for(const s of Object.values(d.services??{}))delete s.build;fs.writeFileSync(p,JSON.stringify(d,null,2));'
	@echo "Rendered deploy/rendered/docker-compose.yml (build: stripped — the mini only pulls). Never commit it; real secrets are baked in."

deploy: gen-compose
	scp rendered/docker-compose.yml $(DEPLOY_USER)@$(DEPLOY_HOST):$(REMOTE_COMPOSE)
	$(SSH) "$(REMOTE_PATH) docker compose -f $(REMOTE_COMPOSE) pull && docker compose -f $(REMOTE_COMPOSE) up -d --remove-orphans"
	@echo "Deployed IMAGE_TAG=$(IMAGE_TAG) to $(DEPLOY_HOST). Purge the Cloudflare cache (OPERATIONS §1)."

build-push-deploy: push deploy

rollback:
	$(MAKE) deploy IMAGE_TAG=$(IMAGE_TAG)

## --- Shared platform network (the edge stack itself is deployed from
## ~/work/customs-copilot/deploy: make platform-deploy) ---

platform-network:
	$(SSH) "$(REMOTE_PATH) docker network inspect platform >/dev/null 2>&1 || docker network create platform"

## --- One-time first-boot commands (run in the containers on the mini —
## no repo checkout needed there; the api image bundles dist/, drizzle
## config + migrations, and drizzle-kit) ---

migrate:
	$(SSH) "$(REMOTE_PATH) docker compose -f $(REMOTE_COMPOSE) exec -T -w /app/packages/api api ./node_modules/.bin/drizzle-kit migrate"

seed:
	$(SSH) "$(REMOTE_PATH) docker compose -f $(REMOTE_COMPOSE) exec -T api bun run packages/api/dist/database/seed.js"

seed-admin:
	$(SSH) "$(REMOTE_PATH) docker compose -f $(REMOTE_COMPOSE) exec -T api bun run packages/api/dist/database/seed-admin.js"

admin-promote:
	@test -n "$(EMAIL)" || (echo "Usage: make admin-promote EMAIL=<owner-email>" && exit 1)
	$(SSH) "$(REMOTE_PATH) docker compose -f $(REMOTE_COMPOSE) exec -T postgres psql -U chobi -d chobi -c \"UPDATE \\\"user\\\" SET role='admin' WHERE email='$(EMAIL)';\""

first-boot: migrate seed seed-admin
	@echo "Migrate/seed done. Sign up through the UI, then: make -C deploy admin-promote EMAIL=<owner-email>"

ssh-mini:
	$(SSH)

clean:
	rm -rf rendered
