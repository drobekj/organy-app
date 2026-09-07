#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

# Operator-only wrapper around the established Phase 31.33 logical backup.
# A private age identity is never needed to create a backup.
readonly mode="${1:-}"
readonly work_root="${ORGANY_BACKUP_WORK_ROOT:-${RUNNER_TEMP:-${TMPDIR:-/tmp}}}"
work=""
cleanup() {
  if [[ -n "$work" && -d "$work" ]]; then rm -rf -- "$work"; fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
fail() { printf 'Encrypted PostgreSQL backup: FAIL — %s\n' "$1" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || fail "$1 is required"; }
require() { [[ -n "${!1:-}" ]] || fail "$1 is required"; }

case "$mode" in
  create)
    require DATABASE_URL_UNPOOLED
    require ORGANY_BACKUP_RECIPIENT
    require ORGANY_BACKUP_OUTPUT_DIR
    need age; need tar; need mktemp; need npx; need pg_dump
    [[ "${ORGANY_PG_TOOL_MODE:-path}" == path ]] || fail 'The encrypted workflow requires direct PostgreSQL client tools'
    [[ "${ORGANY_BACKUP_RECIPIENT}" =~ ^age1[a-z0-9]+$ ]] || fail 'A single age X25519 recipient is required'
    [[ -z "${DATABASE_URL_UNPOOLED##*://*}" ]] || fail 'A PostgreSQL URL is required'
    [[ "$DATABASE_URL_UNPOOLED" != *-pooler.* ]] || fail 'A direct/unpooled connection is required'
    [[ "${DATABASE_URL_UNPOOLED}" == *"sslmode=require"* || "${DATABASE_URL_UNPOOLED}" == *"sslmode=verify-full"* ]] || fail 'TLS must be explicitly required'
    # Validate the recipient before connecting to the source or creating plaintext.
    age -r "$ORGANY_BACKUP_RECIPIENT" -o /dev/null </dev/null 2>/dev/null || fail 'The age recipient is invalid'
    [[ -d "$ORGANY_BACKUP_OUTPUT_DIR" ]] || fail 'The encrypted output directory must already exist'
    work="$(mktemp -d "$work_root/organy-453.XXXXXXXX")"
    export ORGANY_PG_TOOL_MODE=path
    export DATABASE_URL="$DATABASE_URL_UNPOOLED"
    export ORGANY_BACKUP_FILE="$work/backup.dump"
    npx --no-install tsx scripts/postgres-backup.ts || fail 'Logical backup failed'
    npx --no-install tsx scripts/postgres-backup-verify.ts || fail 'Logical backup integrity failed'
    stamp="$(date -u +%Y%m%dT%H%M%SZ)"
    output="$ORGANY_BACKUP_OUTPUT_DIR/organy-$stamp.tar.age"
    [[ ! -e "$output" && ! -L "$output" ]] || fail 'Encrypted output already exists'
    tar -C "$work" -cf - backup.dump backup.dump.sha256 | age -r "$ORGANY_BACKUP_RECIPIENT" -o "$work/encrypted.age" || fail 'Encryption failed'
    mv -n -- "$work/encrypted.age" "$output" || fail 'Encrypted publication failed'
    [[ -s "$output" ]] || fail 'Encrypted output is missing or empty'
    printf 'Encrypted PostgreSQL backup: PASS\nEncrypted artifact: %s\n' "$output"
    ;;
  unpack)
    require ORGANY_ENCRYPTED_BACKUP_FILE
    require ORGANY_BACKUP_IDENTITY_FILE
    require ORGANY_BACKUP_OUTPUT_DIR
    need age; need tar; need mktemp; need npx
    [[ -r "$ORGANY_BACKUP_IDENTITY_FILE" ]] || fail 'The private recovery identity is unavailable'
    [[ -d "$ORGANY_BACKUP_OUTPUT_DIR" ]] || fail 'The restore output directory must already exist'
    [[ ! -e "$ORGANY_BACKUP_OUTPUT_DIR/backup.dump" && ! -e "$ORGANY_BACKUP_OUTPUT_DIR/backup.dump.sha256" ]] || fail 'Restore output already exists'
    work="$(mktemp -d "$work_root/organy-453.XXXXXXXX")"
    age -d -i "$ORGANY_BACKUP_IDENTITY_FILE" -o "$work/bundle.tar" "$ORGANY_ENCRYPTED_BACKUP_FILE" || fail 'Decryption/authentication failed'
    # The only accepted bundle members are the two established recovery files.
    members="$(tar -tf "$work/bundle.tar")" || fail 'Invalid backup bundle'
    [[ "$members" == $'backup.dump\nbackup.dump.sha256' ]] || fail 'Unexpected backup bundle members'
    tar -xf "$work/bundle.tar" -C "$work" --no-same-owner --no-same-permissions || fail 'Backup extraction failed'
    export ORGANY_BACKUP_FILE="$work/backup.dump"
    npx --no-install tsx scripts/postgres-backup-verify.ts || fail 'Decrypted backup integrity failed'
    mv -n -- "$work/backup.dump" "$ORGANY_BACKUP_OUTPUT_DIR/backup.dump"
    mv -n -- "$work/backup.dump.sha256" "$ORGANY_BACKUP_OUTPUT_DIR/backup.dump.sha256"
    printf 'Encrypted PostgreSQL backup unpack: PASS\nRestore archive: %s\n' "$ORGANY_BACKUP_OUTPUT_DIR/backup.dump"
    ;;
  *) fail 'Usage: issue-453-encrypted-backup.sh create|unpack' ;;
esac
