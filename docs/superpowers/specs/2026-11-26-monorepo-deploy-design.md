# Monorepo + production deploy — design

Date: 2026-11-26
Branch: `0.2.0_deploy`

## Intent and why

Turn the single-service `badge-generator` repo into a pnpm + Nx monorepo so a
frontend can be added later without another repo split. Make the service
deployable as a self-contained production stack: backend container, Caddy
reverse proxy for domain mapping, Redis for shared caching. Move image builds
to GitHub Actions and ship immutable images to the host, following the
operational style of `mglaroute-vpn-server` but changing the build/deploy
mechanism.

## Goals

- All current service files live under `backend/`; root holds monorepo and
  deploy configuration only.
- `pnpm` + `Nx` workspace with a `backend` project and an (initially absent)
  `frontend` slot.
- `docker-compose.prod.yml` with three services: `backend`, `redis`, `caddy`.
- Shared Redis cache with a driver switch (`memory` for dev/test, `redis` for
  prod).
- GitHub Actions builds and pushes backend and Caddy images to GHCR, then
  deploys them over SSH by pulling on the host. No build and no git clone on
  the host.
- ./backend remains runnable locally with the same commands as before.

## Non-goals

- No frontend container yet (workspace slot only).
- No PostgreSQL — this service has no database.
- No TLS termination in Caddy; an external nginx proxy manager terminates TLS
  and forwards plain HTTP to Caddy (same as the reference project).
- No registry other than GHCR, no Swarm/Kubernetes.
- No multi-replica orchestration; the design merely does not prevent it.

## Anti-goals (failure even if it technically works)

- Redis outage returning 500 for `/api/v1/generate`.
- Building images or running `pnpm install` on the production host.
- Committing `.env`, registry tokens, or SSH keys.
- Container that cannot find `assets/templates/hermit-frame/template.html`,
  the font, or the Chromium binary.

## Constraints (discovered, not chosen)

- Current service is NestJS 11 on npm + `package-lock.json`; no pnpm lockfile.
  Node 20.9+ required by pinned `sharp@0.35.5`.
- Rendering uses `playwright-core@1.65.1` with `chromium.executablePath()`;
  the browser binary must exist in the image at the exact matching revision.
  Template path is `path.resolve(process.cwd(), 'assets/templates/...')`, so
  the runtime working directory **must** be `backend/` and `assets/` must be
  copied there. Chromium is launched with `--allow-file-access-from-files`;
  font and SVG frames load over `file://`.
- `BadgeCache` is currently synchronous (`get(): Buffer | undefined`,
  `set(): void`), implemented by `MemoryCacheService`, injected concretely in
  `GenerationService`, with 1 h TTL / 1000 entries, `CACHE_DISABLED`,
  `FRESH_TEMPLATE` (`FRESH_MANIFEST` alias).
- No health endpoint exists. The reference compose waits for
  `/api/health` with `depends_on: service_healthy`.
- Reference deploy uses git clone + `docker compose build` on the host,
  external `shared-net`, `CADDY_PORT`, `awk`-rendered `Caddyfile.template`,
  `.env` written from a `PROD_ENV` secret, and a preflight that fails before
  touching host state.
- Local `.env` currently contains `CACHE_DISABLED=true`, `FRESH_MANIFEST=true`
  (dev-only, gitignored).
- Working tree is clean; git is available.

## Approaches and decisions

### Deploy mechanism

- **Build on host, git clone + compose build** (the reference pattern):
  rejected. Drags Node, pnpm, lockfile and Chromium download onto the server;
  slow and fragile.
- **`docker save` → scp → `docker load`**: rejected. No registry token on the
  host, but hundreds of MB per deploy, no layer cache, awkward rollback.
- **GHCR + thin SSH agent (chosen)**: CI builds once, host only pulls layers.
  Immutable SHA tags give cheap rollback. Requires a registry login on the
  host; use the workflow's `GITHUB_TOKEN` via `--password-stdin`, never logged.

### Cache integration

- **Driver switch (chosen)**: one async `BadgeCache` contract,
  `CACHE_DRIVER=memory|redis`. Redis is primary in prod; in-memory stays for
  local dev and unit tests. Smallest change to existing code/tests, one
  invalidation path.
- **L1 memory + L2 Redis**: rejected for now. Two TTLs and two invalidation
  paths; can be added later behind the same contract.
- **`@nestjs/cache-manager` + Redis adapter**: rejected. Different `get<T>`
  contract would still require rewriting `GenerationService` and its tests.

### Caddy config delivery

- **Bake `Caddyfile.template` into a Caddy image with an awk entrypoint
  (chosen)**: no config sync to the host; domain values stay env-driven.
- **Sync `Caddyfile.template` over SSH**: rejected. Extra host state to
  manage and drift.

### Container base

- **`mcr.microsoft.com/playwright:v1.65.1-noble` for both builder and runtime
  (chosen, builder's call to verify)**: matches `playwright-core@1.65.1`,
  ships the browser and system libs. `node:20-alpine` from the reference is
  unsuitable here because Chromium and its dependencies are absent.
  Verification by actually building and smoke-testing is mandatory.

## Decisions made here

### 1. Repository layout

```
/                         root: monorepo + infra
  package.json            private, packageManager pnpm@10.12.1, devDeps nx
  pnpm-workspace.yaml     packages: backend, frontend
  pnpm-lock.yaml          generated, committed
  nx.json                 targetDefaults, namedInputs, defaultBase: master
  .gitignore              node_modules, dist, coverage, .env*, logs, .worktrees
  .env.example            compose/deploy vars
  Dockerfile              targets: backend-prod, caddy-prod
  .dockerignore
  docker-compose.prod.yml
  Caddyfile.template
  caddy-entrypoint.sh
  .github/workflows/deploy.yml
  scripts/deploy-remote.sh
  docs/                   stays at root
  .vscode/                stays at root
  backend/                all current service files, via git mv:
    package.json          name: badge-generator-backend
    src/ test/ scripts/ assets/
    tsconfig.json tsconfig.build.json jest.config.js nest-cli.json
    README.md  .env (gitignored)  .env.example
  frontend/               absent; workspace entry reserved
```

- `git mv` for every moved file so history is preserved.
- `package-lock.json` is deleted only after `pnpm install` produces a valid
  `pnpm-lock.yaml`.
- Root `package.json` scripts delegate: `pnpm nx run backend:build`,
  `backend:test`, `backend:test:e2e`, `backend:serve`, `backend:assets:build`.
- `backend/project.json` defines explicit Nx targets with `nx:run-commands`
  rather than relying on Nx inference (builder's call; keep it simple and
  predictable). Targets run with `cwd = backend`, which preserves every
  existing relative path and `process.cwd()`-based template lookup.
- Nx and `@nx/js` are root devDependencies, pinned to a stable version at
  implementation time (builder's call).

### 2. Redis cache change

- `BadgeCache` becomes async:
  `get(key): Promise<Buffer | undefined>`, `set(key, value): Promise<void>`.
- Injection token `BADGE_CACHE` in `CacheModule`; a factory selects the
  implementation from `CACHE_DRIVER` (`memory` default, `redis` in prod).
  `GenerationService` injects the token, not a concrete class.
- `MemoryCacheService` methods become `async`; its LRU/TTL/disabled logic is
  unchanged. Existing cache specs are updated to `await get(...)`.
- New `RedisCacheService` uses `ioredis` (added to `backend/package.json`).
  Values are stored as **base64 strings** with `SET badge:<sha> <base64> EX
  <seconds>`, read with `GET` and decoded back to `Buffer` — avoids utf8
  corruption of PNG/WebP bytes. TTL is `Math.ceil(CACHE_TTL_MS / 1000)`.
  `CACHE_MAX_ENTRIES` remains memory-only.
- `CACHE_DISABLED` and `FRESH_TEMPLATE`/`FRESH_MANIFEST` keep their current
  bypass semantics in `GenerationService`; `get`/`set` are now awaited.
- On Redis errors: log via Nest `Logger`, return `undefined` from `get` and
  no-op in `set`, so requests render through instead of failing. This is a
  deliberate call: cache availability must not break image generation.
- `RedisCacheService` implements `OnModuleDestroy` and quits the client.
- Unit tests mock the ioredis client; no real Redis is needed for unit tests.
  `generation.service.spec.ts` changes its cache mocks from
  `mockReturnValue` to `mockResolvedValue`.

### 3. Health endpoint

- Add a `HealthController`/`HealthModule` in `backend/src` serving
  `GET /api/health` → `200 { "status": "ok" }` (liveness only; Redis has its
  own healthcheck).
- Compose backend healthcheck uses plain Node (no `wget` assumption):
  `node -e "require('http').get('http://127.0.0.1:3000/api/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"`.

### 4. Images

- Root `Dockerfile`:
  - `backend-prod`: builder stage based on
    `mcr.microsoft.com/playwright:v1.65.1-noble`, install pnpm 10.12.1, copy
    root manifests + `backend/package.json`, `pnpm install --frozen-lockfile`,
    copy `backend/`, run `pnpm nx run backend:build`. Runtime stage same base,
    `WORKDIR /app/backend`, copy `/app/node_modules`,
    `/app/backend/node_modules`, `/app/backend/dist`, `/app/backend/assets`,
    `/app/backend/package.json`. `NODE_ENV=production`, `EXPOSE 3000`,
    `CMD ["node", "dist/main.js"]`. Preserve pnpm's symlink layout by copying
    both node_modules locations, as the reference does.
  - `caddy-prod`: `caddy:2-alpine`, copy `Caddyfile.template` and
    `caddy-entrypoint.sh`, entrypoint renders the template with `awk` from
    env vars then execs `caddy run --config /etc/caddy/Caddyfile --adapter caddyfile`.
- `Caddyfile.template` follows the reference: global `auto_https off`,
  explicit `http://<SERVICE_SUBDOMAIN>.<COMMON_DOMAIN>:80` block with
  `reverse_proxy {BACKEND_HOST}:{BACKEND_PORT}`. Add a catch-all/health route
  only if needed. TLS stays external.
- `.dockerignore`: `.git`, `node_modules`, `dist`, `coverage`, `.env*`,
  `.superpowers`, `docs`, `*.log`, `.worktrees`.

### 5. Compose (`docker-compose.prod.yml`)

- `redis`: `redis:7-alpine`, `redis-server --appendonly yes --requirepass
  ${REDIS_PASSWORD}`, `redis_data` volume, password-aware ping healthcheck,
  internal network, `restart: unless-stopped`.
- `backend`: `image: ${BACKEND_IMAGE:-ghcr.io/ashenhermit/hermit-badges-generator/backend:latest}`,
  env `NODE_ENV=production`, `PORT=3000`, `CACHE_DRIVER=redis`,
  `CACHE_TTL_MS=3600000`, `REDIS_HOST=redis`, `REDIS_PORT=6379`,
  `REDIS_PASSWORD`, `REDIS_DB=0`; `depends_on: redis: service_healthy`;
  healthcheck; internal network; restart.
- `caddy`: `image: ${CADDY_IMAGE:-ghcr.io/ashenhermit/hermit-badges-generator/caddy:latest}`,
  ports `${CADDY_PORT:-8080}:80`, env `COMMON_DOMAIN`, `SERVICE_SUBDOMAIN`
  (default `badges`), `BACKEND_HOST=backend`, `BACKEND_PORT=3000`;
  `depends_on: backend: service_healthy`; volumes `caddy_data`,
  `caddy_config`, `caddy_logs`; networks internal + external `shared-net`.
- Volumes: `redis_data`, `caddy_data`, `caddy_config`, `caddy_logs`.
- Networks: internal bridge (name: `badge-generator`) and external
  `shared-net`, matching the reference.

### 6. Env contract

- Root `.env.example`: `REDIS_PASSWORD`, `COMMON_DOMAIN`, `SERVICE_SUBDOMAIN`,
  `CADDY_PORT`, `BACKEND_IMAGE`, `CADDY_IMAGE`.
- `backend/.env.example`: `PORT`, `CACHE_DRIVER`, `CACHE_TTL_MS`,
  `CACHE_MAX_ENTRIES`, `CACHE_DISABLED`, `FRESH_TEMPLATE`,
  `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB`.
- `PROD_ENV` secret supplies the root env values; CI appends the two image
  tags before writing `.env` to the host. `.env` is `chmod 600`, CRLF
  normalized, never echoed in logs.

### 7. Production environment (confirmed)

- Production branch: **`master`**. `origin/master` does not exist yet (only
  `origin/0.1.0` and `origin/0.2.0_deploy` exist); pushing `master` to origin
  is a prerequisite for the push trigger. Workflow trigger, dispatch default,
  Nx `defaultBase`, and rollback docs all use `master`.
- Host: `ssh root@158.255.6.45`, user `root`, no passwordless-sudo probing
  needed.
- Deploy directory: `/home/hermit-badges-generator`. It does not exist yet and
  there are no running containers — fresh install, no data migration and no
  volume preservation step. CI creates the directory before writing `.env`.
- GHCR namespace from git remote:
  `ghcr.io/ashenhermit/hermit-badges-generator/{backend,caddy}`.

### 8. Deploy workflow and host script

- `.github/workflows/deploy.yml`, `push` to `master` + `workflow_dispatch`
  with `ref` input (default `master`), `concurrency: deploy-production`
  (`cancel-in-progress: false`), `permissions: contents: read`.
- Jobs:
  1. `verify`: pnpm setup, Node 20 with pnpm cache, `pnpm install
     --frozen-lockfile`, `pnpm nx run backend:assets:build`, `backend:test`,
     `backend:build`.
  2. `build`: needs `verify`; `docker/setup-buildx-action` with GHA cache,
     `docker/login-action` to `ghcr.io` with `GITHUB_TOKEN`
     (`packages: write`), `docker/build-push-action` twice with targets
     `backend-prod` / `caddy-prod`, tags `sha-<short>` and `latest`.
  3. `deploy`: needs `build`; `environment: production`, SSH setup from
     secrets (`SSH_HOST`, `SSH_USER`, `SSH_PORT`, `SSH_PRIVATE_KEY`),
     preflight validate `PROD_ENV`, `scp` compose file, write `.env`
     (secret plus image tags), run `scripts/deploy-remote.sh` over stdin.
     `packages: read` permission for the token used on the host.
- `scripts/deploy-remote.sh` (adapted from the reference, much smaller):
  fail-fast preflight (deploy path writable, required env keys non-empty),
  `docker login ghcr.io --password-stdin` with the CI token, idempotent
  `docker compose --project-directory ... --env-file ... -f ... pull`,
  `up -d --force-recreate --wait`, `docker image prune -f`. Keep the
  reference's credential redaction in `log()`, exit codes, and
  `DEPLOY_SOURCE_ONLY=1` / `DRY_RUN=1` test hooks. No git, no sudo probing
  beyond what is needed for docker access.
- Rollback: re-run `workflow_dispatch` with the previous commit ref (rebuilds
  that SHA) or write a previous `sha-*` tag into `BACKEND_IMAGE`/
  `CADDY_IMAGE` on the host and `up -d`. Builder may simplify the UI for
  this; document it in `DEPLOY.md`.

## What is left to the builder

- Pin concrete Nx version and choose `@nx/js` vs plain `nx` + `project.json`
  (recommendation: plain `nx` with explicit `project.json` targets).
- Confirm the public domain/subdomain with the user before finalizing
  `.env.example` defaults; env-driven so this does not block implementation.
- Validate the Playwright base image tag `v1.65.1-noble` exists and that the
  browser actually launches in the built image; adjust base if not.
- Keep `README.md` (root) pointing to `backend/README.md` and document local
  dev, deploy, and rollback.
