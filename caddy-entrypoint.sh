#!/bin/sh
set -eu

FRONTEND_HOST="${FRONTEND_HOST:-frontend}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"

awk -v SERVICE_SUBDOMAIN="$SERVICE_SUBDOMAIN" \
    -v FRONTEND_SUBDOMAIN="$FRONTEND_SUBDOMAIN" \
    -v COMMON_DOMAIN="$COMMON_DOMAIN" \
    -v BACKEND_HOST="$BACKEND_HOST" \
    -v BACKEND_PORT="$BACKEND_PORT" \
    -v FRONTEND_HOST="$FRONTEND_HOST" \
    -v FRONTEND_PORT="$FRONTEND_PORT" \
    '{
        gsub(/\{FRONTEND_SUBDOMAIN\}/, FRONTEND_SUBDOMAIN)
        gsub(/\{SERVICE_SUBDOMAIN\}/, SERVICE_SUBDOMAIN)
        gsub(/\{COMMON_DOMAIN\}/, COMMON_DOMAIN)
        gsub(/\{BACKEND_HOST\}/, BACKEND_HOST)
        gsub(/\{BACKEND_PORT\}/, BACKEND_PORT)
        gsub(/\{FRONTEND_HOST\}/, FRONTEND_HOST)
        gsub(/\{FRONTEND_PORT\}/, FRONTEND_PORT)
        print
    }' /etc/caddy/Caddyfile.template > /etc/caddy/Caddyfile

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
