#!/usr/bin/env bash
# Render docs/database/examples/*.html from the AsciiDoc sources.
#
# CONTENT comes from sources/ferrosa/examples/**/*.adoc, which tracks the engine
# repo through scripts/sync-from-ferrosa.sh. PRESENTATION comes from theme/ in
# this repo. That split is deliberate: sync-from-ferrosa.sh rsyncs the sources
# tree with --delete, so a theme kept inside it is silently reverted on the next
# sync. This repo owns the site's look, exactly as it owns docs/.
#
# That is also why this drives asciidoctor directly instead of calling the
# Makefile in the sources tree: that Makefile points at its own bundled theme,
# and it is upstream's file to change, not ours.
#
# CI regenerates and fails if the committed HTML drifts, so run this and commit
# docs/database/examples/ after touching either the sources or the theme.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
examples_dir="${FERROSA_EXAMPLES_DIR:-${repo_root}/sources/ferrosa/examples}"
theme_dir="${FERROSA_EXAMPLES_THEME:-${repo_root}/theme}"
out_dir="${FERROSA_EXAMPLES_OUTDIR:-${repo_root}/docs/database/examples}"

# The stylesheet is copied in beside the pages under this name and linked
# relatively, so the output directory stays self-contained.
stylesheet_name="examples.css"

if [[ ! -d "${examples_dir}" ]]; then
  echo "missing examples directory: ${examples_dir}" >&2
  exit 1
fi

if [[ ! -f "${theme_dir}/${stylesheet_name}" ]]; then
  echo "missing theme stylesheet: ${theme_dir}/${stylesheet_name}" >&2
  exit 1
fi

if ! command -v asciidoctor >/dev/null 2>&1; then
  echo "missing asciidoctor; install with: gem install asciidoctor -v 2.0.20 --no-document" >&2
  exit 1
fi

mkdir -p "${out_dir}"

# docinfo=shared picks up all three of the theme's docinfo files:
#   docinfo.html         -> <head>            (favicon, pre-paint theme script)
#   docinfo-header.html  -> just after <body> (site header lockup)
#   docinfo-footer.html  -> just before </body> (site footer, theme toggle, copy buttons)
#
# reproducible          keeps the generated "Last updated" stamp out of the diff
# source-highlighter!   leaves Rouge off; the theme styles its class names itself
# stylesheet!           emits no stylesheet of its own — theme/docinfo.html carries
#                       the <link>. Asciidoctor's own `stylesheet` attribute probes
#                       for the file next to each source document even under
#                       linkcss, and warns when it is not there; it never will be,
#                       because the theme lives here and the sources are synced.
render() { # <source.adoc> <output-name.html>
  asciidoctor \
    -a reproducible \
    -a 'source-highlighter!' \
    -a 'stylesheet!' \
    -a docinfo=shared \
    -a "docinfodir=${theme_dir}" \
    -D "${out_dir}" \
    -o "$2" \
    "$1"
}

shopt -s nullglob
sources=("${examples_dir}"/*/*.adoc)
shopt -u nullglob

if [[ ${#sources[@]} -eq 0 ]]; then
  echo "no .adoc sources found under ${examples_dir}" >&2
  exit 1
fi

for src in "${sources[@]}"; do
  name="$(basename "${src}" .adoc)"
  echo "Converting ${src#"${repo_root}/"} -> ${out_dir#"${repo_root}/"}/${name}.html"
  render "${src}" "${name}.html"
done

echo "Converting index.adoc -> ${out_dir#"${repo_root}/"}/index.html"
render "${examples_dir}/index.adoc" "index.html"

cp "${theme_dir}/${stylesheet_name}" "${out_dir}/${stylesheet_name}"

echo "rendered ${#sources[@]} examples + index into ${out_dir#"${repo_root}/"}"
