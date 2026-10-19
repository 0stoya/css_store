#!/usr/bin/env bash
# Offline server premerge test, never checkout a PR into the running app.
# Run as the Unix owner of the app's production working tree.
set -Eeuo pipefail
umask 077

app="${1:-}"
case "$app" in
  admin)
    repo="/srv/css/css_admin"
    expected_repo="0stoya/css_admin"
    ref="refs/heads/feat/employee-address-mapping-20261019"
    ;;
  store)
    repo="/srv/css/css_store"
    expected_repo="0stoya/css_store"
    ref="refs/heads/feat/employee-address-autoselect-20261019"
    ;;
  *)
    printf >&2 'Usage: bash premerge-employee-address-server-test.sh admin|store\n'
    exit 2
    ;;
esac

die() { printf >&2 'PREMERGE_HOLD: %s\n' "$*"; exit 1; }

[ "$EUID" -ne 0 ] || die "Do not run Node builds as root."
[ -d "$repo/.git" ] || [ -f "$repo/.git" ] || die "Expected Git repository missing: $repo"
[ "$(stat -c '%u' "$repo")" = "$(id -u)" ] || die "Run as Unix owner of $repo."
for bin in git node npm df awk mktemp nice tr timeout; do
  command -v "$bin" >/dev/null || die "Missing executable: $bin"
done
remote="$(git -C "$repo" remote get-url origin)"
case "$remote" in
  *"$expected_repo"*) ;;
  *) die "Origin does not match $expected_repo" ;;
esac
major="$(node -p "Number(process.versions.node.split('.')[0])")"
[ "$major" -ge 22 ] || die "Node 22+ is required."

scratch_root="${CSS_PREMERGE_SCRATCH_ROOT:-/tmp}"
[ -d "$scratch_root" ] && [ -w "$scratch_root" ] || die "Scratch directory is unavailable."
space_kb="$(df -Pk "$scratch_root" | awk 'NR==2 {print $4}')"
[ "${space_kb:-0}" -ge 4194304 ] || die "At least 4 GiB scratch space is required."
available_kb="$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)"
[ "${available_kb:-0}" -ge 4194304 ] || die "Under 4 GiB available RAM; do not compete with PM2."

prod_sha_before="$(git -C "$repo" rev-parse HEAD)"
prod_branch_before="$(git -C "$repo" symbolic-ref --quiet --short HEAD || true)"
run_dir="$(mktemp -d -p "$scratch_root" "css-employee-address-$app-XXXXXXXX")"
worktree="$run_dir/source"
worktree_attached=0
completed=0
tested_sha="NOT_FETCHED"

finish() {
  status=$?
  trap - EXIT
  if [ "$worktree_attached" -eq 1 ]; then
    git -C "$repo" worktree remove --force "$worktree" >/dev/null 2>&1 || true
  fi
  case "$run_dir" in
    "$scratch_root"/css-employee-address-"$app"-*) rm -rf -- "$run_dir" ;;
    *) printf >&2 'PREMERGE_HOLD: Refusing unexpected scratch path cleanup.\n'; exit 1 ;;
  esac
  prod_sha_after="$(git -C "$repo" rev-parse HEAD 2>/dev/null || echo UNKNOWN)"
  prod_branch_after="$(git -C "$repo" symbolic-ref --quiet --short HEAD || true)"
  printf 'TEST_APP=%s\nTESTED_SHA=%s\nPRODUCTION_SHA_BEFORE=%s\nPRODUCTION_SHA_AFTER=%s\n' \
    "$app" "$tested_sha" "$prod_sha_before" "$prod_sha_after"
  if [ "$prod_sha_after" != "$prod_sha_before" ] || [ "$prod_branch_after" != "$prod_branch_before" ]; then
    printf >&2 'PREMERGE_HOLD: Production checkout changed during test.\n'
    exit 1
  fi
  if [ "$status" -eq 0 ] && [ "$completed" -eq 1 ]; then
    printf 'EMPLOYEE_ADDRESS_%s_SERVER_OFFLINE_PREFLIGHT=PASS\n' "$(printf %s "$app" | tr '[:lower:]' '[:upper:]')"
  else
    printf 'EMPLOYEE_ADDRESS_%s_SERVER_OFFLINE_PREFLIGHT=FAIL\n' "$(printf %s "$app" | tr '[:lower:]' '[:upper:]')"
    exit 1
  fi
}
trap finish EXIT

printf 'Testing PR branch %s (production checkout SHA %s)\n' "$ref" "$prod_sha_before"
git -C "$repo" fetch --no-tags origin "$ref"
tested_sha="$(git -C "$repo" rev-parse 'FETCH_HEAD^{commit}')"
printf 'PR_HEAD_SHA=%s\n' "$tested_sha"
git -C "$repo" worktree add --detach "$worktree" "$tested_sha"
worktree_attached=1
cd "$worktree"

# Dummy build-time origins; no production tokens or env files loaded.
export NEXT_TELEMETRY_DISABLED=1
export MAGENTO_BASE_URL="https://magento.example.invalid"
export MAGENTO_GRAPHQL_URL="https://magento.example.invalid/graphql"
export MAGENTO_STORE_CODE="default"
export CSS_STORE_URL="https://store.example.invalid"
export CSS_ADMIN_URL="https://admin.example.invalid"
export CSS_ADMIN_DATABASE_URL=""
export CSS_STORE_EMPLOYEE_ADDRESS_DATABASE_URL=""
export NODE_OPTIONS="--max-old-space-size=2048"
export npm_config_cache="$run_dir/npm-cache"

printf 'Testing with isolated dependencies, static typecheck, lint, all unit tests and build...\n'
timeout 900 nice -n 10 bash -e -c '
  npm install --no-audit --no-fund --no-save --package-lock=false
  npm run typecheck
  npm run lint
  node --test tests/*.test.mjs
  npm run build
'
completed=1
