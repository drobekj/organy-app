#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

# Operator-only wrapper around the existing Phase 31.33 backup and verifier.
# The private recovery identity is never needed or accepted for backup creation.
mode="${1:-}"
work=""
created_output=""
succeeded=0
cleanup() {
  if [[ -n "$work" && -d "$work" ]]; then rm -rf -- "$work" || true; fi
  if [[ "$succeeded" != 1 && -n "$created_output" && -d "$created_output" ]]; then rm -rf -- "$created_output" || true; fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
fail() { printf 'Encrypted PostgreSQL backup: FAIL — %s\n' "$1" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || fail "$1 is required"; }
require() { [[ -n "${!1:-}" ]] || fail "$1 is required"; }

# No database connection is made during preflight; credential values are never printed.
validate_source() {
  require DATABASE_URL_UNPOOLED
  require ORGANY_BACKUP_SOURCE_KIND
  need node
  node - <<'NODE' || fail 'Source identity, direct connection or TLS preflight failed'
const raw = process.env.DATABASE_URL_UNPOOLED;
let url;
try { url = new URL(raw); } catch { process.exit(1); }
const host = url.hostname.toLowerCase();
const kind = process.env.ORGANY_BACKUP_SOURCE_KIND;
const local = ['localhost', '127.0.0.1', '[::1]'].includes(host);
if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.username || !url.password || !url.pathname || url.pathname === '/' || (url.port && url.port !== '5432')) process.exit(1);
if (kind === 'production') {
  if (!host.endsWith('.neon.tech') || host.includes('-pooler.') || decodeURIComponent(url.pathname) !== '/neondb' || !['require', 'verify-full'].includes(url.searchParams.get('sslmode'))) process.exit(1);
} else if (kind === 'disposable') {
  if (process.env.ORGANY_BACKUP_DISPOSABLE !== '1' || !local) process.exit(1);
} else process.exit(1);
NODE
  [[ "${ORGANY_PG_TOOL_MODE:-path}" == path ]] || fail 'Direct PostgreSQL client tools are required'
}

case "$mode" in
  create)
    validate_source
    require ORGANY_BACKUP_RECIPIENT
    require ORGANY_BACKUP_OUTPUT_DIR
    need age; need tar; need mktemp; need npx; need pg_dump; need pg_restore
    [[ "${ORGANY_BACKUP_RECIPIENT}" =~ ^age1[a-z0-9]+$ ]] || fail 'A single age X25519 recipient is required'
    [[ -z "${ORGANY_BACKUP_IDENTITY_FILE:-}" ]] || fail 'A private recovery identity must not be supplied to the backup job'
    # Validate recipient and all configuration before connecting to the database.
    age -r "$ORGANY_BACKUP_RECIPIENT" -o /dev/null </dev/null 2>/dev/null || fail 'The age recipient is invalid'
    [[ -d "$ORGANY_BACKUP_OUTPUT_DIR" ]] || fail 'The encrypted output directory must already exist'
    max_bytes="${ORGANY_BACKUP_MAX_BYTES:-104857600}"
    [[ "$max_bytes" =~ ^[1-9][0-9]*$ ]] || fail 'ORGANY_BACKUP_MAX_BYTES must be a positive integer'
    work="$(mktemp -d "${ORGANY_BACKUP_WORK_ROOT:-${RUNNER_TEMP:-${TMPDIR:-/tmp}}}/organy-453.XXXXXXXX")"
    export ORGANY_PG_TOOL_MODE=path
    export DATABASE_URL="$DATABASE_URL_UNPOOLED"
    export ORGANY_BACKUP_FILE="$work/backup.dump"
    npx --no-install tsx scripts/postgres-backup.ts || fail 'Logical backup failed'
    npx --no-install tsx scripts/postgres-backup-verify.ts || fail 'Logical backup integrity failed'
    stamp="$(date -u +%Y%m%dT%H%M%SZ)"
    output="$ORGANY_BACKUP_OUTPUT_DIR/organy-$stamp.tar.age"
    [[ ! -e "$output" && ! -L "$output" ]] || fail 'Encrypted output already exists'
    tar -C "$work" -cf - backup.dump backup.dump.sha256 | age -r "$ORGANY_BACKUP_RECIPIENT" -o "$work/encrypted.age" || fail 'Encryption failed'
    bytes="$(wc -c < "$work/encrypted.age")"
    [[ "$bytes" -gt 0 && "$bytes" -le "$max_bytes" ]] || fail 'Encrypted archive exceeds the configured size limit'
    # A hard link publishes atomically without replacing an existing archive.
    # If the output is on another filesystem, publication fails closed.
    ln -- "$work/encrypted.age" "$output" || fail 'Encrypted publication failed'
    succeeded=1
    printf 'Encrypted PostgreSQL backup: PASS\nEncrypted artifact: %s\n' "$output"
    ;;
  unpack)
    require ORGANY_ENCRYPTED_BACKUP_FILE
    require ORGANY_BACKUP_IDENTITY_FILE
    require ORGANY_BACKUP_OUTPUT_DIR
    need age; need tar; need mktemp; need npx
    [[ -r "$ORGANY_BACKUP_IDENTITY_FILE" ]] || fail 'The private recovery identity is unavailable'
    [[ -r "$ORGANY_ENCRYPTED_BACKUP_FILE" ]] || fail 'The encrypted archive is unavailable'
    [[ ! -e "$ORGANY_BACKUP_OUTPUT_DIR" && ! -L "$ORGANY_BACKUP_OUTPUT_DIR" ]] || fail 'Restore output already exists'
    work="$(mktemp -d "${ORGANY_BACKUP_WORK_ROOT:-${RUNNER_TEMP:-${TMPDIR:-/tmp}}}/organy-453.XXXXXXXX")"
    age -d -i "$ORGANY_BACKUP_IDENTITY_FILE" -o "$work/bundle.tar" "$ORGANY_ENCRYPTED_BACKUP_FILE" 2>/dev/null || fail 'Decryption/authentication failed'
    members="$(tar -tf "$work/bundle.tar")" || fail 'Invalid backup bundle'
    [[ "$members" == $'backup.dump\nbackup.dump.sha256' ]] || fail 'Unexpected backup bundle members'
    types="$(tar -tvf "$work/bundle.tar" | cut -c1)" || fail 'Invalid backup bundle types'
    [[ "$types" == $'-\n-' ]] || fail 'Backup bundle must contain regular files only'
    tar -xf "$work/bundle.tar" -C "$work" --no-same-owner --no-same-permissions || fail 'Backup extraction failed'
    export ORGANY_BACKUP_FILE="$work/backup.dump"
    npx --no-install tsx scripts/postgres-backup-verify.ts || fail 'Decrypted backup integrity failed'
    mkdir -m 700 -- "$ORGANY_BACKUP_OUTPUT_DIR" || fail 'Could not create isolated restore output'
    created_output="$ORGANY_BACKUP_OUTPUT_DIR"
    cp -- "$work/backup.dump" "$work/backup.dump.sha256" "$created_output/" || fail 'Restore output publication failed'
    succeeded=1
    printf 'Encrypted PostgreSQL backup unpack: PASS\nRestore archive: %s\n' "$created_output/backup.dump"
    ;;
  *) fail 'Usage: issue-453-encrypted-backup.sh create|unpack' ;;
esac
