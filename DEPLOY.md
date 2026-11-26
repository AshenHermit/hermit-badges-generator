# Production deployment

The production stack is defined in `docker-compose.prod.yml` and runs four
containers on the host:

- `redis` (`redis:7-alpine`) — shared badge cache with append-only persistence.
  Reachable only on the internal `badge-generator` network.
- `backend` — badge generator from
  `ghcr.io/ashenhermit/hermit-badges-generator/backend`. Reachable only on the
  internal `badge-generator` network; waits for Redis to be healthy before
  starting.
- `frontend` — Next.js standalone UI from
  `ghcr.io/ashenhermit/hermit-badges-generator/frontend`, built by the
  `frontend-prod` stage. Reachable only on the internal `badge-generator`
  network; waits for the backend to be healthy. Serves the single-page app and
  proxies `/api/*` rewrites to `backend:3000` via `API_PROXY_TARGET`.
- `caddy` — reverse proxy from
  `ghcr.io/ashenhermit/hermit-badges-generator/caddy`. Renders
  `<SERVICE_SUBDOMAIN>.<COMMON_DOMAIN>` from the environment, routes `/api/*`
  to `backend:3000` and all other paths to `frontend:3000`. It joins both the
  internal `badge-generator` network and the external `shared-net`, and waits
  for both the backend and the frontend to be healthy.

TLS is terminated by the external proxy on `shared-net`; Caddy serves plain
HTTP with `auto_https off` from its baked `Caddyfile.template`. Host port
`${CADDY_PORT:-8080}` maps to Caddy's container port 80. No extra DNS record is
needed: the UI is served at the root of the existing API host.

Named volumes: `redis_data`, `caddy_data`, `caddy_config`, `caddy_logs`.
The `shared-net` network must exist on the host before the stack starts.

## Environment contract

Root `.env` (copy `.env.example`; never commit `.env`) supplies:

| Variable | Purpose | Compose default |
| --- | --- | --- |
| `REDIS_PASSWORD` | Redis `--requirepass` and backend/healthcheck auth | required |
| `COMMON_DOMAIN` | Domain part of the Caddy site address | required |
| `SERVICE_SUBDOMAIN` | Subdomain part of the Caddy site address | `badges` |
| `CADDY_PORT` | Host port mapped to Caddy port 80 | `8080` |
| `BACKEND_IMAGE` | Backend image reference | `ghcr.io/ashenhermit/hermit-badges-generator/backend:latest` |
| `FRONTEND_IMAGE` | Frontend image reference | `ghcr.io/ashenhermit/hermit-badges-generator/frontend:latest` |
| `CADDY_IMAGE` | Caddy image reference | `ghcr.io/ashenhermit/hermit-badges-generator/caddy:latest` |
| `FRONTEND_HOST` | Caddy upstream for the UI | `frontend` |
| `FRONTEND_PORT` | Caddy upstream port for the UI | `3000` |
| `API_PROXY_TARGET` | Next.js server-side rewrite target for `/api/*` | `http://backend:3000` |
| `NEXT_PUBLIC_API_BASE_URL` | Build-time public API base baked into generated links | `https://api.badges.ashen-hermit.space` |

`FRONTEND_HOST`, `FRONTEND_PORT` and `API_PROXY_TARGET` are set by compose;
`NEXT_PUBLIC_API_BASE_URL` is consumed at image build time, not by compose.
Override it with the repository variable of the same name if the public API
host differs.

Backend-local development defaults are documented in `backend/.env.example`;
production cache and Redis values are injected by compose rather than read
from that file.

`REDIS_PASSWORD` is passed **unquoted** to
`redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}`, so use a single
token with no whitespace and no shell metacharacters (letters, digits, `-`, `_`
are safe). A missing `.env`, or an empty `REDIS_PASSWORD`, is not caught by
`docker compose config`: Compose substitutes an empty value, Redis starts with
a malformed/empty `--requirepass`, and the stack fails later at Redis
authentication rather than at config time. Both the CI preflight and the host
script reject an empty key before the stack is touched.

## How deployment works

`.github/workflows/deploy.yml` runs on a push to `master` or via
`workflow_dispatch`:

1. `verify` — `pnpm install --frozen-lockfile`, assets, backend unit tests and
   build, plus frontend type-check and Vitest suite.
2. `build` — builds the `backend-prod`, `frontend-prod` and `caddy-prod` targets
   and pushes immutable `sha-<short>` tags plus `latest` for all three images
   to GHCR.
3. `deploy` — validates the env locally **before** any remote step, creates the
   deploy directory on the host, writes `.env` from `PROD_ENV` with the three
   `sha-*` tags appended, copies `docker-compose.prod.yml`, and pipes
   `scripts/deploy-remote.sh` to the host.

The host never runs `git`, `pnpm`, or a Docker build: it logs into GHCR with
the workflow token (`--password-stdin`, never logged), pulls the three images,
and recreates the stack with `docker compose up -d --force-recreate --wait`.

### Prerequisites

- `master` pushed to `origin` (the push trigger and `workflow_dispatch`
  default both use `master`).
- GHCR `packages: write` for the built-in `GITHUB_TOKEN`; the `deploy` job uses
  `packages: read` for the host pull.
- Repository secrets: `SSH_PRIVATE_KEY` (root login), `PROD_ENV` (the root env
  values above). `SSH_PORT` is optional and defaults to `22`. The optional
  repository variable `NEXT_PUBLIC_API_BASE_URL` overrides the public API base
  baked into the frontend image.
- The external `shared-net` Docker network must exist on the host.

The first deploy creates `/home/hermit-badges-generator`. This is a fresh
install: there is no data migration and no volume preservation step.

## Rollback

- Preferred: run the workflow manually (`workflow_dispatch`) with `ref` set to
  an older commit. CI rebuilds that SHA, tags it `sha-<short>` and redeploys it.
- Immediate: on the host, edit `.env` so `BACKEND_IMAGE`, `FRONTEND_IMAGE` and
  `CADDY_IMAGE` point at previous `sha-<short>` tags in their GHCR repositories,
  then run
  `docker compose --project-directory /home/hermit-badges-generator --env-file
  /home/hermit-badges-generator/.env -f
  /home/hermit-badges-generator/docker-compose.prod.yml up -d --force-recreate
  --wait`. The last `*_IMAGE` lines in `.env` win.

Design and implementation record:
[spec](docs/superpowers/specs/2026-11-26-monorepo-deploy-design.md),
[plan](docs/superpowers/plans/2026-11-26-monorepo-deploy.md).
