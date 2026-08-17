#!/usr/bin/env bash
# Resolve the latest STABLE public release of each product and write the version
# data the site serves.
#
# This is the ONLY place a version number enters the site. No page carries a
# version literal; each one marks the spot with <span data-fv="..."> and
# docs/versions.js fills it at runtime from docs/versions.json.
#
# Run by .github/workflows/pages.yml immediately before the Pages artifact is
# uploaded — on every deploy and on a daily schedule. The outputs are build
# artifacts, not source: they are gitignored, and a release bump reaches the
# site through the next deploy with no commit and no PR.
#
# Outputs (all under docs/, all deploy-time):
#   versions.json   { products: { ferrosa|memory|forge: {tag,version,minor} } }
#   LATEST          v-prefixed ferrosa tag        — read by install.sh/setup.sh
#   LATEST-MEMORY   v-prefixed ferrosa-memory tag — read by install-memory.sh
#   LATEST-FORGE    v-prefixed forge tag
#
# Fails loudly. A product whose feed is unreachable, empty, or malformed aborts
# the run and therefore the deploy: shipping a site with a missing or stale
# version is the failure this script exists to prevent.
#
# Requires `gh` authenticated with read access to the three release feeds. All
# three repos are public, so the workflow's default github.token is enough.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# key <TAB> repo <TAB> pointer file consumed by the installers ("-" for none)
PRODUCTS=$'ferrosa\tferrosadb/ferrosa\tLATEST
memory\tferrosadb/ferrosa-memory\tLATEST-MEMORY
forge\tferrosadb/forge\tLATEST-FORGE'

# Newest release whose tag is a plain 3-segment SemVer. This is what excludes
# the nightly v2026.08.17.0154 builds: they carry four segments, and several are
# published as full releases rather than pre-releases, so --exclude-pre-releases
# alone would not filter them.
latest_stable_tag() {
  gh release list --repo "$1" --exclude-pre-releases -L 40 --json tagName \
    -q '[.[].tagName | select(test("^v[0-9]+\\.[0-9]+\\.[0-9]+$"))][0]'
}

out_json="docs/versions.json"
entries=()

while IFS=$'\t' read -r key repo pointer; do
  tag="$(latest_stable_tag "${repo}" || true)"

  if [[ ! "${tag}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "error: no stable release found for ${repo} (got '${tag:-<empty>}')." >&2
    echo "       Refusing to publish the site with a missing ${key} version." >&2
    exit 1
  fi

  version="${tag#v}"     # 0.19.1
  minor="${version%.*}"  # 0.19

  entries+=("$(printf '    "%s": { "tag": "%s", "version": "%s", "minor": "%s" }' \
    "${key}" "${tag}" "${version}" "${minor}")")

  if [[ "${pointer}" != "-" ]]; then
    printf '%s\n' "${tag}" > "docs/${pointer}"
  fi

  echo "${key}: ${tag}"
done <<< "${PRODUCTS}"

# Joined by hand rather than with jq so the file stays diffable and the script
# keeps one dependency instead of two. Bash array joins take only the first
# character of IFS, so the comma-and-newline separator is written explicitly.
{
  printf '{\n'
  printf '  "generated": "%s",\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf '  "products": {\n'
  for i in "${!entries[@]}"; do
    printf '%s' "${entries[$i]}"
    [[ $i -lt $((${#entries[@]} - 1)) ]] && printf ','
    printf '\n'
  done
  printf '  }\n'
  printf '}\n'
} > "${out_json}"

# Parse what we just wrote. A file the browser cannot read is a silent blank
# pill on every page, so prove it is valid JSON before it ships.
python3 -c "import json,sys; json.load(open('${out_json}'))" \
  || { echo "error: generated ${out_json} is not valid JSON" >&2; exit 1; }

echo "wrote ${out_json}, docs/LATEST, docs/LATEST-MEMORY, docs/LATEST-FORGE"
