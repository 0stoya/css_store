#!/usr/bin/env bash
# Root-owned production checkout pre-merge test.
# Root reads the exact PR commit; only the unprivileged nobody user runs npm.
# Does not switch production branches, restart services, modify env, or migrate DB.
set -Eeuo pipefail
umask 077

app="${1:-}"
expected_sha="${2:-}"
die() { printf >&2 'PREMERGE_HOLD: %s\n' "$*"; exit 1; }

case "$app" in
  admin)
    repo="/srv/css/css_admin"
    remote_ref="refs/heads/feat/employee-address-mapping-20261019"
    expected_origin="0stoya/css_admin"
    ;;
  store)
    repo="/srv/css/css_store"
    remote_ref="refs/heads/feat/employee-address-autoselect-20261019"
    expected_origin="0stoya/css_store"
    ;;
  *) die "Usage: bash premerge-employee-address-server-test.sh admin|store EXPECTED_COMMIT_SHA" ;;
esac

[ "$EUID" -eq 0 ] || die "Run the controller as root. npm is explicitly run as nobody."
[[ "$expected_sha" =~ ^[0-9a-f]{40}$ ]] || die "Expected commit must be a full 40-character Git SHA."
[ -d "$repo/.git" ] || [ -f "$repo/.git" ] || die "Production Git checkout missing: $repo"
[ "$(stat -c '%u' "$repo")" -eq 0 ] || die "This runner is specifically for root-owned checkouts."
for bin in git node npm awk df mktemp tar chown runuser timeout nice; do
  command -v "$bin" >/dev/null || die "Missing tool: $bin"
done
id nobody >/dev/null 2>&1 || die "Missing unprivileged nobody account."
origin="$(git -C "$repo" remote get-url origin)"
if [[ ! "$origin" =~ ^(git@github\.com:|https://github\.com/|ssh://git@github\.com/)${expected_origin}(\.git)?$ ]]; then
  die "Git origin is not the expected GitHub repository."
fi

node_major="$(node -p "Number(process.versions.node.split('.')[0])")"
[ "$node_major" -ge 22 ] || die "Node 22 or later is required."
scratch_root="${CSS_PREMERGE_SCRATCH_ROOT:-/tmp}"
[ -d "$scratch_root" ] && [ -w "$scratch_root" ] || die "Scratch directory is missing/unwritable."
available_disk_kb="$(df -Pk "$scratch_root" | awk 'NR==2 {print $4}')"
[ "${available_disk_kb:-0}" -ge 3145728 ] || die "At least 3 GiB scratch disk space required."
available_ram_kb="$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)"
[ "${available_ram_kb:-0}" -ge 2621440 ] || die "Under 2.5 GiB available RAM: protect the live apps."

production_sha_before="$(git -C "$repo" rev-parse HEAD)"
production_branch_before="$(git -C "$repo" symbolic-ref --quiet --short HEAD || true)"
scratch="$(mktemp -d -p "$scratch_root" "css-employee-address-$app-XXXXXXXX")"
source_dir="$scratch/source"
tested_sha="NOT_FETCHED"
passed=0

finish() {
  status=$?
  trap - EXIT
  if [[ "$scratch" == "$scratch_root"/css-employee-address-"$app"-* ]]; then
    rm -rf -- "$scratch"
  else
    printf >&2 'PREMERGE_HOLD: Unexpected scratch path. Refusing cleanup.\n'
    exit 1
  fi

  production_sha_after="$(git -C "$repo" rev-parse HEAD 2>/dev/null || echo UNKNOWN)"
  production_branch_after="$(git -C "$repo" symbolic-ref --quiet --short HEAD || true)"
  printf 'APP=%s\nTESTED_SHA=%s\nPRODUCTION_SHA_BEFORE=%s\nPRODUCTION_SHA_AFTER=%s\n' \
    "$app" "$tested_sha" "$production_sha_before" "$production_sha_after"
  if [ "$production_sha_after" != "$production_sha_before" ] ||
     [ "$production_branch_after" != "$production_branch_before" ]; then
    printf >&2 'PREMERGE_HOLD: Production Git checkout moved while testing.\n'
    exit 1
  fi

  if [ "$status" -eq 0 ] && [ "$passed" -eq 1 ]; then
    printf 'EMPLOYEE_ADDRESS_%s_OFFLINE_PREFLIGHT=PASS\n' "$(echo "$app" | tr '[:lower:]' '[:upper:]')"
  else
    printf 'EMPLOYEE_ADDRESS_%s_OFFLINE_PREFLIGHT=FAIL\n' "$(echo "$app" | tr '[:lower:]' '[:upper:]')"
    exit 1
  fi
}
trap finish EXIT

git -C "$repo" fetch --no-tags origin "$remote_ref"
tested_sha="$(git -C "$repo" rev-parse 'FETCH_HEAD^{commit}')"
[ "$tested_sha" = "$expected_sha" ] ||
  die "PR branch head changed: expected $expected_sha, got $tested_sha. Review before testing."

mkdir -p "$source_dir" "$scratch/home" "$scratch/npm-cache" "$scratch/tmp"
git -C "$repo" archive --format=tar "$tested_sha" |
  tar -xf - -C "$source_dir" --no-same-owner

# Sanity check: only example dotenv files, never deployed secrets.
if find "$source_dir" -type f \( -name '.env.production' -o -name '.env.local' -o -name '.env.production.local' \) | grep -q .; then
  die "PR archive contains unexpected environment secrets."
fi
chown -Rh nobody:"$(id -gn nobody)" "$scratch"

# Empty environment: no inherited production database URL or Magento credentials.
# All build-time URLs are deliberately invalid test origins.
runuser -u nobody -- env -i \
  PATH=/usr/local/bin:/usr/bin:/bin \
  HOME="$scratch/home" \
  TMPDIR="$scratch/tmp" \
  npm_config_cache="$scratch/npm-cache" \
  WORKDIR="$source_dir" \
  NEXT_TELEMETRY_DISABLED=1 \
  NODE_OPTIONS=--max-old-space-size=1536 \
  MAGENTO_BASE_URL=https://magento.example.invalid \
  MAGENTO_GRAPHQL_URL=https://magento.example.invalid/graphql \
  MAGENTO_STORE_CODE=default \
  CSS_ADMIN_URL=https://admin.example.invalid \
  CSS_STORE_URL=https://store.example.invalid \
  CSS_ADMIN_DATABASE_URL= \
  CSS_STORE_EMPLOYEE_ADDRESS_DATABASE_URL= \
  timeout --signal=TERM --kill-after=10s 900 nice -n 10 bash -ec '
    cd "$WORKDIR"
    npm install --no-audit --no-fund --no-save --package-lock=false
    npm run typecheck
    npm run lint
    node --test tests/*.test.mjs
    npm run build
  '
passed=1
