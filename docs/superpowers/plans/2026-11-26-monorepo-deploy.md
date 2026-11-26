# Monorepo + Production Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the NestJS badge service into a pnpm/Nx `backend/` workspace, add a Redis-backed cache driver and health endpoint, and ship a GHCR-based CI/CD pipeline with a three-container Compose stack on the production host.

**Architecture:** The repo becomes a pnpm workspace with an Nx `backend` project and a reserved `frontend` slot. GitHub Actions verifies, builds two immutable images (backend + Caddy) into GHCR, then a thin SSH script pulls them on the host and recreates the `backend`/`redis`/`caddy` stack. Redis is selected at runtime by `CACHE_DRIVER`, behind the existing `BadgeCache` abstraction made async.

**Tech Stack:** pnpm 10.12.1, Nx, NestJS 11, TypeScript 5, Jest 29, `ioredis`, `playwright-core@1.65.1`, `sharp@0.35.5`, Caddy 2, Redis 7, Docker Compose, GitHub Actions/GHCR.

**Spec:** `docs/superpowers/specs/2026-11-26-monorepo-deploy-design.md`

## Global Constraints

- Node 20.9+ required by pinned `sharp@0.35.5`; use Node 20 in CI and images.
- `packageManager: pnpm@10.12.1`; no `package-lock.json` may remain.
- Playwright browser revision must match `playwright-core@1.65.1` exactly.
- Template path is `path.resolve(process.cwd(), 'assets/templates/hermit-frame/template.html')`: runtime `WORKDIR` must be `/app/backend` and `assets/` must be present there.
- Chromium launches with `--allow-file-access-from-files`; font and SVGs load over `file://`.
- `CACHE_DRIVER=memory|redis`; prod uses `redis`. `CACHE_DISABLED` and `FRESH_TEMPLATE`/`FRESH_MANIFEST` keep their bypass semantics.
- Redis values are base64 strings stored as `SET badge:<sha> <base64> EX <seconds>`; TTL seconds = `Math.ceil(CACHE_TTL_MS / 1000)`.
- Redis failure must never make `/api/v1/generate` return 500.
- Production branch: `master`. Host: `ssh root@158.255.6.45`, directory `/home/hermit-badges-generator` (absent, fresh install, no migration).
- GHCR namespace: `ghcr.io/ashenhermit/hermit-badges-generator`; images `backend` and `caddy`.
- TLS terminated externally; Caddy uses `auto_https off` and serves plain HTTP.
- `.env` files are gitignored; secrets are never echoed or committed.
- Local development is on Windows; commands must remain PowerShell-friendly (`pnpm ...`), tests use `--runInBand`-safe config.

## Review Focus

- Non-UTF8 image bytes through Redis: a PNG/WebP buffer must come back byte-identical — pinned by Task 3's base64 roundtrip test using `Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0x00])`.
- Redis outage: `GET` rejection must degrade to render-through, not throw — pinned by Task 3's error-path test.
- Wrong/missing Chromium in the built image: a live `/api/v1/generate` call inside the built container must return a real PNG — pinned by Task 5's container smoke test.
- Wrong `process.cwd()` in the container: template/font/SVG resolution must succeed at `/app/backend` — pinned by the same Task 5 smoke test.
- Caddy env substitution: rendered config must contain the configured domain and backend upstream — pinned by Task 5's template-render check and Task 6's `docker compose config`.
- Deploy preflight with missing required env: script must fail before any host mutation — pinned by Task 7's `DEPLOY_SOURCE_ONLY=1 validate_env` test.

---

### Task 1: pnpm/Nx workspace and move service into `backend/`

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `nx.json`, `backend/project.json`, `README.md` (root stub)
- Create: `backend/.env.example`
- Modify: `.gitignore`
- Delete: `package-lock.json` (only after lockfile generation)
- Move with `git mv`: `src/`, `test/`, `scripts/`, `assets/`, `package.json`, `tsconfig.json`, `tsconfig.build.json`, `jest.config.js`, `nest-cli.json`, `README.md`, `.env` → `backend/`

**Interfaces:**
- Consumes: existing scripts in the current root `package.json` (`build`, `start`, `start:dev`, `assets:build`, `test`, `test:e2e`).
- Produces: Nx project id `backend`; package name `badge-generator-backend`; root scripts `backend:build`, `backend:test`, `backend:test:e2e`, `backend:serve`, `backend:assets:build` that delegate via `pnpm nx run backend:<target>`. All targets run with `cwd = backend`.

- [ ] **Step 1: Move service files**

Run from repo root:

```powershell
git mv src test scripts assets package.json tsconfig.json tsconfig.build.json jest.config.js nest-cli.json README.md .env backend/
```

Expected: all listed paths exist under `backend/`, nothing left at root except `.git`, `.gitignore`, `.vscode`, `docs`, `node_modules`, `dist`, `badge_frame.svg`.

- [ ] **Step 2: Create workspace manifests**

`pnpm-workspace.yaml`:

```yaml
packages:
  - backend
  - frontend
```

(`frontend` directory does not exist yet; this is the reserved slot.)

Root `package.json`: private, `"name": "hermit-badges-generator"`, `"packageManager": "pnpm@10.12.1"`, devDependencies `nx` and `typescript` pinned to current stable, and the five delegating scripts listed in Interfaces. Root `nx.json`: `$schema` for nx, `defaultBase: master`, `namedInputs` (`default`, `production`), `targetDefaults` for `build` (dependsOn `^build`, cache true) and `test` (cache true). `backend/project.json`: project name `backend`, targets `build`/`test`/`test:e2e`/`serve`/`assets:build`, each an `nx:run-commands` executor with `cwd: backend` running the corresponding script from `backend/package.json`.

- [ ] **Step 3: Adjust moved package and ignore rules**

In `backend/package.json` set `"name": "badge-generator-backend"`. In `.gitignore` replace the root-relative entries with patterns that cover both levels: `**/node_modules/`, `**/dist/`, `**/coverage/`, `**/.env`, `*.log`, `.worktrees/`, `.superpowers/sdd/`, `backend/assets/templates/hermit-frame/template-*.html`. Create `backend/.env.example` with `PORT`, `CACHE_DRIVER`, `CACHE_TTL_MS`, `CACHE_MAX_ENTRIES`, `CACHE_DISABLED`, `FRESH_TEMPLATE`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB` (safe placeholder values, driver `memory` for local dev).

- [ ] **Step 4: Generate pnpm lockfile and remove npm lockfile**

```powershell
pnpm install
git rm package-lock.json
```

Expected: `pnpm-lock.yaml` created, no `package-lock.json`, `pnpm install --frozen-lockfile` succeeds.

- [ ] **Step 5: Verify existing behavior survived the move**

```powershell
pnpm --filter badge-generator-backend assets:build
pnpm nx run backend:test
pnpm nx run backend:build
```

Expected: all three exit 0; `backend/dist/main.js` exists.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: move service into pnpm/nx backend workspace"
```

---

### Task 2: Async `BadgeCache` contract with memory driver

**Files:**
- Modify: `backend/src/cache/badge-cache.ts`, `backend/src/cache/memory-cache.service.ts`, `backend/src/cache/cache.module.ts`, `backend/src/cache/cache.spec.ts`, `backend/src/generation/generation.service.ts`, `backend/src/generation/generation.service.spec.ts`
- Test: `backend/src/cache/cache.spec.ts`, `backend/src/generation/generation.service.spec.ts`

**Interfaces:**
- Consumes: `BadgeCache` from Task 1, `MemoryCacheService` constructor `(ttlMs?: number, maxEntries?: number)`.
- Produces: `export const BADGE_CACHE: symbol`; `BadgeCache = { get(key: string): Promise<Buffer | undefined>; set(key: string, value: Buffer): Promise<void> }`; `CacheModule` provides and exports `BADGE_CACHE`; `MemoryCacheService implements BadgeCache` with async methods and `get size(): number`.

- [ ] **Step 1: Write failing tests for async contract and driver selection**

In `cache.spec.ts` change `MemoryCacheService` assertions to `await svc.get(...)` and add:

```ts
it('exposes the BADGE_CACHE token from CacheModule', async () => {
  const { BADGE_CACHE } = await import('./badge-cache');
  expect(typeof BADGE_CACHE).toBe('symbol');
});

it('resolves to a MemoryCacheService when CACHE_DRIVER is not redis', async () => {
  delete process.env.CACHE_DRIVER;
  const moduleRef = await Test.createTestingModule({ imports: [CacheModule] }).compile();
  expect(moduleRef.get(BADGE_CACHE)).toBeInstanceOf(MemoryCacheService);
});
```

In `generation.service.spec.ts` change cache mocks to `{ get: jest.fn().mockResolvedValue(undefined), set: jest.fn().mockResolvedValue(undefined) }` and the hit test to `badgeCache.get.mockResolvedValue(PNG)`; all existing assertions stay.

- [ ] **Step 2: Run tests to verify they fail**

```powershell
pnpm nx run backend:test
```

Expected: FAIL — `BADGE_CACHE` not exported; cache mocks return Promises where the service expects Buffers.

- [ ] **Step 3: Implement async contract and memory provider**

`badge-cache.ts`: export `BADGE_CACHE` and change both methods to return Promises. `memory-cache.service.ts`: mark `get`/`set` `async` (body unchanged). `cache.module.ts`: keep `MemoryCacheService` as a provider and add `{ provide: BADGE_CACHE, useFactory: (mem: MemoryCacheService) => mem, inject: [MemoryCacheService] }`, exporting `BADGE_CACHE`. `generation.service.ts`: inject `@Inject(BADGE_CACHE) private readonly badgeCache: BadgeCache` and `await` both `get` and `set`.

- [ ] **Step 4: Run tests to verify they pass**

```powershell
pnpm nx run backend:test
```

Expected: PASS, including the new token/driver tests and all existing generation tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src
git commit -m "refactor: make badge cache contract async"
```

---

### Task 3: Redis cache driver

**Files:**
- Create: `backend/src/cache/redis-cache.service.ts`, `backend/src/cache/redis-cache.service.spec.ts`
- Modify: `backend/package.json`, `backend/src/cache/cache.module.ts`
- Test: `backend/src/cache/redis-cache.service.spec.ts`

**Interfaces:**
- Consumes: `BadgeCache`, `BADGE_CACHE` from Task 2.
- Produces: `RedisCacheService implements BadgeCache, OnModuleDestroy`, constructor `(client?: RedisClientLike)`; `RedisClientLike = { get(key: string): Promise<string | null>; set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>; quit(): Promise<unknown> }`. Exported token `REDIS_CLIENT`. `CacheModule` factory returns `RedisCacheService` when `CACHE_DRIVER === 'redis'`, otherwise `MemoryCacheService`.

- [ ] **Step 1: Write failing tests for Redis driver**

Create `redis-cache.service.spec.ts` with a fake client (`get`/`set`/`quit` as `jest.fn()`), `process.env.CACHE_TTL_MS = '3600000'`, `delete process.env.CACHE_DISABLED`, and these cases:

```ts
it('stores base64 with EX seconds and restores byte-identical Buffer', async () => {
  const raw = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0x00]);
  await svc.set('k', raw);
  expect(client.set).toHaveBeenCalledWith('badge:k', raw.toString('base64'), 'EX', 3600);
  client.get.mockResolvedValue(raw.toString('base64'));
  expect(await svc.get('k')).toEqual(raw);
});
it('returns undefined on miss', async () => {
  client.get.mockResolvedValue(null);
  expect(await svc.get('k')).toBeUndefined();
});
it('does not touch redis when CACHE_DISABLED is true', async () => {
  process.env.CACHE_DISABLED = 'true';
  await svc.set('k', Buffer.from('x'));
  expect(await svc.get('k')).toBeUndefined();
  expect(client.set).not.toHaveBeenCalled();
  expect(client.get).not.toHaveBeenCalled();
});
it('degrades to render-through when redis fails', async () => {
  client.get.mockRejectedValue(new Error('down'));
  client.set.mockRejectedValue(new Error('down'));
  await expect(svc.get('k')).resolves.toBeUndefined();
  await expect(svc.set('k', Buffer.from('x'))).resolves.toBeUndefined();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```powershell
pnpm nx run backend:test
```

Expected: FAIL — module `./redis-cache.service` not found.

- [ ] **Step 3: Add `ioredis` and implement the driver**

`pnpm --filter badge-generator-backend add ioredis` in `backend/`. Implement `RedisCacheService`: default client is a lazily connecting `ioredis` instance configured from `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD`/`REDIS_DB`; prefix keys with `badge:`; `get` decodes base64; `set` uses EX with `Math.ceil(CACHE_TTL_MS / 1000)`; wrap both in try/catch that logs via `Logger` and returns `undefined`; `onModuleDestroy` quits the client. Export `REDIS_CLIENT` for optional injection.

Update `CacheModule` so the `BADGE_CACHE` factory injects both implementations and selects by `process.env.CACHE_DRIVER === 'redis'`, exporting `BADGE_CACHE`. Constructing `RedisCacheService` in memory mode must not open a connection.

- [ ] **Step 4: Run tests to verify they pass**

```powershell
pnpm nx run backend:test
```

Expected: PASS; confirm the redis tests run and no real Redis connection is attempted.

- [ ] **Step 5: Commit**

```bash
git add backend
git commit -m "feat: add redis badge cache driver"
```

---

### Task 4: Health endpoint

**Files:**
- Create: `backend/src/health/health.controller.ts`, `backend/src/health/health.module.ts`, `backend/src/health/health.controller.spec.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/src/health/health.controller.spec.ts`

**Interfaces:**
- Consumes: global prefix `api` configured in `backend/src/app.setup.ts`.
- Produces: `GET /api/health` → `200 { status: 'ok' }`; `HealthModule` exportable for `AppModule.imports`.

- [ ] **Step 1: Write the failing test**

```ts
it('returns ok status', async () => {
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController],
  }).compile();
  expect(moduleRef.get(HealthController).check()).toEqual({ status: 'ok' });
});
```

- [ ] **Step 2: Run to verify failure**

```powershell
pnpm nx run backend:test
```

Expected: FAIL — `./health.controller` not found.

- [ ] **Step 3: Implement controller and module**

Create `HealthController` with `@Controller('health')` and `@Get() check(): { status: string }` returning `{ status: 'ok' }`. Create `HealthModule` declaring/exporting it. Add `HealthModule` to `AppModule.imports`.

- [ ] **Step 4: Run to verify pass**

```powershell
pnpm nx run backend:test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src
git commit -m "feat: add health endpoint"
```

---

### Task 5: Docker images for backend and Caddy

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `Caddyfile.template`, `caddy-entrypoint.sh`
- Test: container smoke test (no unit test file)

**Interfaces:**
- Consumes: `backend/dist/main.js`, `backend/assets/`, pnpm workspace manifests from Task 1.
- Produces: build targets `backend-prod` and `caddy-prod`; images `ghcr.io/ashenhermit/hermit-badges-generator/backend` and `.../caddy`.

- [ ] **Step 1: Write the Caddy template and entrypoint**

`Caddyfile.template` mirrors the reference but with a single service route:

```
{
	auto_https off
}

http://{SERVICE_SUBDOMAIN}.{COMMON_DOMAIN}:80 {
	reverse_proxy {BACKEND_HOST}:{BACKEND_PORT}
}
```

`caddy-entrypoint.sh` renders placeholders from env with the reference's `awk` expression into `/etc/caddy/Caddyfile`, then `exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile`.

- [ ] **Step 2: Write the Dockerfile**

Builder stage `FROM mcr.microsoft.com/playwright:v1.65.1-noble AS builder`: `WORKDIR /app`, install `pnpm@10.12.1` globally, copy root `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `nx.json`, `backend/package.json`, run `pnpm install --frozen-lockfile`, copy `backend`, run `pnpm nx run backend:build`.

`FROM mcr.microsoft.com/playwright:v1.65.1-noble AS backend-prod`: `WORKDIR /app/backend`, `ENV NODE_ENV=production`, copy `/app/node_modules`, `/app/backend/node_modules`, `/app/backend/dist`, `/app/backend/assets`, `/app/backend/package.json`, `EXPOSE 3000`, `CMD ["node", "dist/main.js"]`.

`FROM caddy:2-alpine AS caddy-prod`: copy `Caddyfile.template` to `/etc/caddy/`, copy `caddy-entrypoint.sh` to `/usr/local/bin/`, `ENTRYPOINT ["sh", "/usr/local/bin/caddy-entrypoint.sh"]`, `EXPOSE 80`.

`.dockerignore`: `.git`, `node_modules`, `dist`, `coverage`, `.env*`, `.superpowers`, `docs`, `*.log`, `.worktrees`.

- [ ] **Step 3: Verify template substitution locally**

```powershell
$env:SERVICE_SUBDOMAIN='badges'; $env:COMMON_DOMAIN='example.test'; $env:BACKEND_HOST='backend'; $env:BACKEND_PORT='3000'
```

Run the same `awk` expression from the entrypoint against `Caddyfile.template` into stdout. Expected: a single `http://badges.example.test:80` block proxying to `backend:3000`, with no `{...}` placeholders left.

- [ ] **Step 4: Build and smoke-test the backend image**

```powershell
docker build --target backend-prod -t badges-backend:test .
docker run --rm -d --name badges-test -p 13000:3000 -e CACHE_DRIVER=memory badges-backend:test
```

Then request `http://localhost:13000/api/health` (expect `{"status":"ok"}`) and `http://localhost:13000/api/v1/generate?left=Hello&right=World` (expect `200`, `Content-Type: image/png`, non-empty PNG bytes). Finally `docker stop badges-test`. This proves Chromium, font/SVG assets, and `/app/backend` cwd all work inside the image.

- [ ] **Step 5: Build the Caddy image**

```powershell
docker build --target caddy-prod -t badges-caddy:test .
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add Dockerfile .dockerignore Caddyfile.template caddy-entrypoint.sh
git commit -m "build: add backend and caddy production images"
```

---

### Task 6: Compose stack and env contract

**Files:**
- Create: `docker-compose.prod.yml`, `.env.example`, `DEPLOY.md` (initial section)
- Test: `docker compose config` validation

**Interfaces:**
- Consumes: images from Task 5, health endpoint from Task 4.
- Produces: services `redis`, `backend`, `caddy`; network `badge-generator` (internal) and `shared-net` (external); volumes `redis_data`, `caddy_data`, `caddy_config`, `caddy_logs`.

- [ ] **Step 1: Write compose file**

`redis`: `redis:7-alpine`, `command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}`, `redis_data:/data`, healthcheck `REDISCLI_AUTH="$$REDIS_PASSWORD" redis-cli ping | grep -q PONG`, internal network, `restart: unless-stopped`.

`backend`: `image: ${BACKEND_IMAGE:-ghcr.io/ashenhermit/hermit-badges-generator/backend:latest}`, `container_name: hermit-badges-backend`, env `NODE_ENV=production`, `PORT=3000`, `CACHE_DRIVER=redis`, `CACHE_TTL_MS=3600000`, `REDIS_HOST=redis`, `REDIS_PORT=6379`, `REDIS_PASSWORD`, `REDIS_DB=0`; `depends_on.redis.condition: service_healthy`; healthcheck using the Node one-liner from the spec; internal network; `restart: unless-stopped`.

`caddy`: `image: ${CADDY_IMAGE:-ghcr.io/ashenhermit/hermit-badges-generator/caddy:latest}`, `container_name: hermit-badges-caddy`, ports `"${CADDY_PORT:-8080}:80"`, env `COMMON_DOMAIN`, `SERVICE_SUBDOMAIN`, `BACKEND_HOST=backend`, `BACKEND_PORT=3000`; volumes `caddy_data:/data`, `caddy_config:/config`, `caddy_logs:/var/log/caddy`; `depends_on.backend.condition: service_healthy`; networks `badge-generator` and `shared-net`.

- [ ] **Step 2: Write root `.env.example`**

Keys: `REDIS_PASSWORD`, `COMMON_DOMAIN`, `SERVICE_SUBDOMAIN`, `CADDY_PORT`, `BACKEND_IMAGE`, `CADDY_IMAGE`. Add a comment that TLS is terminated by the external proxy and Caddy listens on plain HTTP.

- [ ] **Step 3: Validate compose with sample env**

```powershell
$env:REDIS_PASSWORD='test-pass'; $env:COMMON_DOMAIN='example.test'; $env:SERVICE_SUBDOMAIN='badges'
docker compose -f docker-compose.prod.yml config --quiet
```

Expected: exit 0. Then inspect output and confirm the backend image ref, Redis password, Caddy port mapping, and both networks are present.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.prod.yml .env.example DEPLOY.md
git commit -m "deploy: add production compose stack"
```

---

### Task 7: GHCR deploy workflow, host script, and docs

**Files:**
- Create: `.github/workflows/deploy.yml`, `scripts/deploy-remote.sh`
- Modify: `README.md` (root), `DEPLOY.md`
- Test: script syntax + preflight dry-run

**Interfaces:**
- Consumes: compose file from Task 6, images from Task 5, `master` branch on origin.
- Produces: `workflow_dispatch` inputs `ref`, jobs `verify` → `build` → `deploy`; host script invoked as `DEPLOY_PATH=/home/hermit-badges-generator COMPOSE_FILE=docker-compose.prod.yml bash scripts/deploy-remote.sh <ref>` (over stdin from CI).

- [ ] **Step 1: Write the workflow**

`.github/workflows/deploy.yml`: `on.push.branches: [master]`, `workflow_dispatch` with `ref` input default `master`; `concurrency.group: deploy-production`, `cancel-in-progress: false`; `permissions: contents: read`. Jobs:

1. `verify` — `actions/checkout@v4` with `ref: ${{ inputs.ref || 'master' }}`, `pnpm/action-setup@v4`, `actions/setup-node@v4` (node 20, cache pnpm), `pnpm install --frozen-lockfile`, `pnpm nx run backend:assets:build`, `pnpm nx run backend:test`, `pnpm nx run backend:build`.
2. `build` — needs `verify`, `permissions: contents: read, packages: write`; first step computes the short SHA in shell (`echo "SHORT_SHA=${GITHUB_SHA::7}" >> "$GITHUB_OUTPUT"`, id `short_sha`) because GitHub expressions have no `substring`. Then `docker/setup-buildx-action@v3` with GHA cache, `docker/login-action@v3` to `ghcr.io` with `${{ secrets.GITHUB_TOKEN }}`; `docker/build-push-action@v6` twice (`target: backend-prod` / `caddy-prod`) with tags `ghcr.io/ashenhermit/hermit-badges-generator/{backend,caddy}:sha-${{ steps.short_sha.outputs.SHORT_SHA }}` and `:latest`. Export the two tags as job outputs.
3. `deploy` — needs `build`, `environment: production`, `timeout-minutes: 60`, `permissions: contents: read, packages: read`; env `SSH_HOST: 158.255.6.45`, `SSH_USER: root`, `SSH_PORT: ${{ secrets.SSH_PORT || '22' }}`, `SSH_PRIVATE_KEY: ${{ secrets.SSH_PRIVATE_KEY }}`, `DEPLOY_PATH: /home/hermit-badges-generator`, `PROD_ENV: ${{ secrets.PROD_ENV }}`, plus image tags from `build`. Steps: SSH key setup + `ssh-keyscan`, remote `mkdir -p "$DEPLOY_PATH"` and permission check, local preflight via `DEPLOY_SOURCE_ONLY=1 DRY_RUN=0 bash -c 'source scripts/deploy-remote.sh; validate_env'` with a temp `.env` (fail before touching host), write `.env` from `PROD_ENV` + image tags over SSH with `umask 077`, `scp` `docker-compose.prod.yml`, then pipe `scripts/deploy-remote.sh` to remote `bash -s` with the image tags and ref.

- [ ] **Step 2: Write the host script**

`scripts/deploy-remote.sh` with `set -Eeuo pipefail`, the reference's redacting `log()`, `die()` with exit codes (2 preflight, 4 bad env, 5 missing image tag), and functions: `validate_env` (required keys `REDIS_PASSWORD COMMON_DOMAIN SERVICE_SUBDOMAIN BACKEND_IMAGE CADDY_IMAGE` non-empty, using the reference's last-occurrence `env_value` helper), `docker_login` (`docker login ghcr.io --username "$GHCR_USER" --password-stdin`, token from CI, never logged), `compose()` wrapping `docker compose --project-directory "$DEPLOY_PATH" --env-file "$DEPLOY_PATH/.env" -f "$DEPLOY_PATH/$COMPOSE_FILE"`, and `main()` → preflight, login, `compose pull`, `compose up -d --force-recreate --wait`, `docker image prune -f`. Support `DRY_RUN=1` and `DEPLOY_SOURCE_ONLY=1` like the reference. No git, no sudo probing (host user is root).

- [ ] **Step 3: Verify script syntax and preflight**

```powershell
bash -n scripts/deploy-remote.sh
$env:DEPLOY_PATH=(New-Item -ItemType Directory -Path (Join-Path $env:TEMP 'badges-deploy-test')).FullName
Set-Content -Path (Join-Path $env:DEPLOY_PATH '.env') -Value "REDIS_PASSWORD=x`nCOMMON_DOMAIN=example.test`nSERVICE_SUBDOMAIN=badges`nBACKEND_IMAGE=ghcr.io/ashenhermit/hermit-badges-generator/backend:latest`nCADDY_IMAGE=ghcr.io/ashenhermit/hermit-badges-generator/caddy:latest"
$env:DEPLOY_SOURCE_ONLY='1'; $env:DRY_RUN='0'
bash -c 'source scripts/deploy-remote.sh; validate_env'
```

Expected: `bash -n` exit 0; `validate_env` exit 0. Remove `REDIS_PASSWORD=` line from the temp `.env` and re-run: expected exit 4 with a message naming the missing key. Repeat with `BACKEND_IMAGE` missing: expected exit 4 or 5 per the script's declared codes.

- [ ] **Step 4: Document deploy and rollback**

`DEPLOY.md`: prerequisites (`origin/master`, GHCR `packages: write`, secrets `SSH_PRIVATE_KEY`, `PROD_ENV`, optional `SSH_PORT`), first deploy creates the directory, rollback via `workflow_dispatch` with an older commit `ref` or by writing a previous `sha-*` tag into `BACKEND_IMAGE`/`CADDY_IMAGE` and `up -d`. Root `README.md`: one-line pointer to `backend/README.md` plus links to the spec, plan, and `DEPLOY.md`.

- [ ] **Step 5: Commit**

```bash
git add .github scripts README.md DEPLOY.md
git commit -m "ci: deploy ghcr images over ssh"
```

---

## Final Verification (after all tasks)

```powershell
pnpm install --frozen-lockfile
pnpm --filter badge-generator-backend assets:build
pnpm nx run backend:test
pnpm nx run backend:build
docker compose -f docker-compose.prod.yml config --quiet
bash -n scripts/deploy-remote.sh
git status --short
```

Expected: all exit 0; `git status` clean. Manual confirmation required on the host after the first workflow run: `curl http://158.255.6.45:8080/...` reaches Caddy, and `docker -H ... ps` shows `hermit-badges-*` containers plus Redis. Production branch is `master` (already pushed to origin).
