#!/bin/sh
set -eu

awk -v SERVICE_SUBDOMAIN="$SERVICE_SUBDOMAIN" \
    -v COMMON_DOMAIN="$COMMON_DOMAIN" \
    -v BACKEND_HOST="$BACKEND_HOST" \
    -v BACKEND_PORT="$BACKEND_PORT" \
    '{
        gsub(/\{SERVICE_SUBDOMAIN\}/, SERVICE_SUBDOMAIN)
        gsub(/\{COMMON_DOMAIN\}/, COMMON_DOMAIN)
        gsub(/\{BACKEND_HOST\}/, BACKEND_HOST)
        gsub(/\{BACKEND_PORT\}/, BACKEND_PORT)
        print
    }' /etc/caddy/Caddyfile.template > /etc/caddy/Caddyfile

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
