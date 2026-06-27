#!/usr/bin/env bash
# Update the version strings shown on the marketing site to the latest STABLE
# releases of ferrosadb/ferrosa and ferrosadb/ferrosa-memory.
#
# Run by .github/workflows/sync-versions.yml (scheduled + on demand). It edits
# the known version-display spots in place; the workflow opens a PR if anything
# changed. Idempotent — re-running when already current is a no-op.
#
# Requires `gh` authenticated with read access to both release feeds (a PAT if
# those repos are private — see the workflow).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

latest_stable_tag() { # repo -> vX.Y.Z (newest 3-segment SemVer release)
  gh release list --repo "$1" --exclude-pre-releases -L 20 --json tagName \
    -q '[.[].tagName | select(test("^v[0-9]+\\.[0-9]+\\.[0-9]+$"))][0]'
}

ferrosa_tag="$(latest_stable_tag ferrosadb/ferrosa)"
fmem_tag="$(latest_stable_tag ferrosadb/ferrosa-memory)"
[[ "$ferrosa_tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "bad ferrosa tag: '$ferrosa_tag'" >&2; exit 1; }
[[ "$fmem_tag"    =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "bad fmem tag: '$fmem_tag'" >&2; exit 1; }

fv="${ferrosa_tag#v}"        # 0.17.0  (full SemVer, used by the database pages)
mv="${fmem_tag#v}"           # 0.23.0
mm="${mv%.*}"                # 0.23    (major.minor, used by the fmem badges)

# 1. Install pointer the install scripts fetch from ferrosadb.com/LATEST.
printf '%s\n' "$ferrosa_tag" > docs/LATEST

# 2. Ferrosa (database/suite) version strings.
perl -i -pe "s/(Ferrosa (?:Suite|Database) is version )[0-9]+\\.[0-9]+\\.[0-9]+/\${1}$fv/g" \
  docs/index.html docs/database/index.html
perl -i -pe "s/(Ferrosa Suite <span[^>]*>)[0-9]+\\.[0-9]+\\.[0-9]+(<\\/span>)/\${1}$fv\${2}/g" docs/index.html
perl -i -pe "s/v[0-9]+\\.[0-9]+\\.[0-9]+( — active development)/v$fv\${1}/g" docs/database/index.html
perl -i -pe "s/(Ferrosa Database \`)v[0-9]+\\.[0-9]+\\.[0-9]+(\`)/\${1}$ferrosa_tag\${2}/g; \
             s/(Ferrosa Memory \`)v[0-9]+\\.[0-9]+\\.[0-9]+(\`)/\${1}$fmem_tag\${2}/g" docs/index.md

# 3. Ferrosa Memory version badges (banner, hero badge, footer span). Scoped to
#    the fmem pages and to badge markup so CSS timings / prose are never touched.
for f in docs/ferrosa-memory/*.html; do
  perl -i -pe "s/(Ferrosa Memory )[0-9]+\\.[0-9]+(\\.[0-9]+)?( —)/\${1}$mm\${3}/g if /beta-tag/" "$f"
  perl -i -pe "s/· [0-9]+\\.[0-9]+(\\.[0-9]+)? ·/· $mm ·/g if /hero-badge/" "$f"
  perl -i -pe "s/(Ferrosa Memory <span[^>]*>)[0-9]+\\.[0-9]+(\\.[0-9]+)?(<\\/span>)/\${1}$mm\${3}/g" "$f"
done

echo "site versions updated: ferrosa=$fv  fmem=$mm  (docs/LATEST=$ferrosa_tag)"
