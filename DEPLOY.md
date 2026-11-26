# Production deployment

The production stack is defined in `docker-compose.prod.yml` and runs three
containers on the host:

- `redis` (`redis:7-alpine`) — shared badge cache with append-only persistence.
  Reachable only on the internal `badge-generator` network.
- `backend` — badge generator from
  `ghcr.io/ashenhermit/hermit-badges-generator/backend`. Reachable only on the
  internal `badge-generator` network; waits for Redis to be healthy before
  starting.
- `caddy` — reverse proxy from
  `ghcr.io/ashenhermit/hermit-badges-generator/caddy`. Renders
  `<SERVICE_SUBDOMAIN>.<COMMON_DOMAIN>` from the environment and proxies to
  `backend:3000`. It joins both the internal `badge-generator` network and the
  external `shared-net`, and waits for the backend to be healthy.

TLS is terminated by the external proxy on `shared-net`; Caddy serves plain
HTTP with `auto_https off` from its baked `Caddyfile.template`. Host port
`${CADDY_PORT:-8080}` maps to Caddy's container port 80.

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
| `CADDY_IMAGE` | Caddy image reference | `ghcr.io/ashenhermit/hermit-badges-generator/caddy:latest` |

Backend-local development defaults are documented in `backend/.env.example`;
production cache and Redis values are injected by compose rather than read
from that file.
