#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
examples_dir="${FERROSA_EXAMPLES_DIR:-${repo_root}/sources/ferrosa/examples}"
out_dir="${FERROSA_EXAMPLES_OUTDIR:-${repo_root}/docs/database/examples}"

if [[ ! -d "${examples_dir}" ]]; then
  echo "missing examples directory: ${examples_dir}" >&2
  exit 1
fi

if ! command -v asciidoctor >/dev/null 2>&1; then
  echo "missing asciidoctor; install with: gem install asciidoctor -v 2.0.20 --no-document" >&2
  exit 1
fi

mkdir -p "${out_dir}"
make -C "${examples_dir}" html OUTDIR="${out_dir}"

