#!/bin/sh
set -eu
# Only a DNS name is substituted, never arbitrary nginx config or all env vars.
case "${STAGING_HOST:-}" in ''|*[!a-z0-9.-]*|.*|*..*|*.|*-.*|*.-*|localhost|*.localhost|*.example|*.test|*.invalid|example.com|*.example.com|example.net|*.example.net|example.org|*.example.org) echo 'Invalid staging host' >&2; exit 1;; esac
[ "${#STAGING_HOST}" -le 253 ] && printf '%s' "$STAGING_HOST" | grep -Eq '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' || { echo 'Invalid staging host' >&2; exit 1; }
printf '%s' "$STAGING_HOST" | grep -Eq '^[0-9]+(\.[0-9]+){3}$' && { echo 'DNS staging host required' >&2; exit 1; }
printf '%s' "$STAGING_HOST" | awk -F. '{for(i=1;i<=NF;i++) if(length($i)>63) exit 1}' || { echo 'Invalid staging host' >&2; exit 1; }
envsubst '${STAGING_HOST}' < /etc/nginx/goease.conf.template > /tmp/nginx.conf
nginx -t -c /tmp/nginx.conf
exec nginx -c /tmp/nginx.conf -g 'daemon off;'
