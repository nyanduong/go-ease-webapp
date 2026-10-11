#!/bin/sh
set -eu
# File-backed Compose secrets retain host permissions. libpq requires an owned,
# non-group/world-readable password file, so copy to private container tmpfs.
umask 077
private=$(mktemp -d /tmp/goease-pg.XXXXXXXX) || exit 1
cleanup() {
  if [ -n "${lock:-}" ]; then rm -f "$lock/archive"; rmdir "$lock"; fi
  rm -f "$private/password" "$private/error"
  rmdir "$private"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM
cat /run/secrets/pg_pass > "$private/password"
chmod 600 "$private/password"
export PGSERVICEFILE=/run/secrets/pg_service PGPASSFILE="$private/password"
export PGSERVICE=goease PGCONNECT_TIMEOUT=5 PGOPTIONS='-c statement_timeout=300000 -c lock_timeout=5000'
fail() { echo 'Private database operation failed; no credential or SQL details are logged.' >&2; exit 1; }
case "${2:-}" in ''|*[!a-zA-Z0-9_-]*) fail;; esac
archive="/backups/$2.dump"
case "${1:-}" in
  backup)
    umask 077
    candidate="$archive.lock"
    mkdir "$candidate" 2>/dev/null || { echo 'Backup label already reserved.' >&2; exit 1; }
    lock="$candidate"
    # Only this process owns this newly created directory. Never remove archive.
    [ ! -e "$archive" ] || fail
    timeout 300s pg_dump --no-password --format=custom --no-owner --no-privileges --file="$lock/archive" 2>"$private/error" || fail
    # Atomic no-clobber publication on the same backup filesystem.
    ln "$lock/archive" "$archive" 2>/dev/null || fail
    sha256sum "$archive"
    ;;
  restore-fresh)
    [ -f "$archive" ] || fail
    # Owner provisions an isolated fresh target; never drop/reset an existing DB.
    count=$(timeout 15s psql --no-password --no-psqlrc -At --set=ON_ERROR_STOP=1 --command="SELECT
      (SELECT count(*) FROM pg_namespace WHERE nspname NOT IN ('public','pg_catalog','information_schema') AND nspname NOT LIKE 'pg_toast%' AND nspname NOT LIKE 'pg_temp_%') +
      (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public') +
      (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public') +
      (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') +
      (SELECT count(*) FROM pg_extension WHERE extname <> 'plpgsql') +
      (SELECT count(*) FROM pg_largeobject_metadata) + (SELECT count(*) FROM pg_foreign_server) +
      (SELECT count(*) FROM pg_event_trigger) + (SELECT count(*) FROM pg_default_acl)" 2>"$private/error") || fail
    [ "$count" = 0 ] || { echo 'Restore requires a fresh empty target database.' >&2; exit 1; }
    timeout 300s pg_restore --no-password --dbname="service=goease" --single-transaction --exit-on-error --no-owner --no-privileges "$archive" 2>"$private/error" || fail
    echo 'Fresh database restored; apply grants and verify before switching traffic.'
    ;;
  *) fail;;
esac
