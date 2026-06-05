#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ferrosa_repo="${FERROSA_REPO_URL:-https://github.com/ferrosadb/ferrosa.git}"
ferrosa_ref="${FERROSA_REF:-main}"
sync_docs=true
sync_examples=true

usage() {
  cat <<'EOF'
Usage: scripts/sync-from-ferrosa.sh [options]

Options:
  --repo <url>        Ferrosa git remote. Default: https://github.com/ferrosadb/ferrosa.git
  --ref <ref>         Branch, tag, or SHA to sync. Default: main
  --skip-docs         Do not copy upstream docs/
  --skip-examples     Do not copy upstream examples/
  -h, --help          Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) ferrosa_repo="$2"; shift 2 ;;
    --ref) ferrosa_ref="$2"; shift 2 ;;
    --skip-docs) sync_docs=false; shift ;;
    --skip-examples) sync_examples=false; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown flag: $1" >&2; usage >&2; exit 2 ;;
  esac
done

tmp="$(mktemp -d)"
trap 'rm -rf "${tmp}"' EXIT

git clone --no-tags --depth 1 "${ferrosa_repo}" "${tmp}/ferrosa" >/dev/null
git -C "${tmp}/ferrosa" fetch --depth 1 origin "${ferrosa_ref}" >/dev/null 2>&1 || true
git -C "${tmp}/ferrosa" checkout --detach "${ferrosa_ref}" >/dev/null 2>&1 || \
  git -C "${tmp}/ferrosa" checkout --detach FETCH_HEAD >/dev/null

if [[ "${sync_docs}" == "true" ]]; then
  rsync -a --delete "${tmp}/ferrosa/docs/" "${repo_root}/docs/"
fi

if [[ "${sync_examples}" == "true" ]]; then
  mkdir -p "${repo_root}/sources/ferrosa"
  rsync -a --delete \
    --exclude target \
    --exclude '*/target' \
    "${tmp}/ferrosa/examples/" \
    "${repo_root}/sources/ferrosa/examples/"
fi

echo "synced ferrosa ${ferrosa_ref}"

