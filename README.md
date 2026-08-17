# Ferrosa Docs

Standalone website and documentation repository for Ferrosa Database and Ferrosa Memory.

This repository owns the standalone deployable static site under `docs/`.
It is intentionally separate from the Ferrosa engine repositories so website
updates are not blocked by unrelated storage, cluster, or CQL CI failures.

Current staging URL: <https://ferrosadb.github.io/ferrosa-docs/>

Production cutover to `www.ferrosadb.com` is a separate operation because the
domain is currently configured on the legacy `ferrosadb/ferrosa` Pages site.

## QA URLs

- Suite docs: <https://ferrosadb.github.io/ferrosa-docs/>
- Database docs: <https://ferrosadb.github.io/ferrosa-docs/database/>
- Database examples: <https://ferrosadb.github.io/ferrosa-docs/database/examples/>
- Memory docs: <https://ferrosadb.github.io/ferrosa-docs/ferrosa-memory/>
- Memory repo alias: <https://ferrosadb.github.io/ferrosa-memory/>

## Layout

```text
docs/                    Published static site and installer scripts
sources/ferrosa/examples  AsciiDoc example sources mirrored from ferrosadb/ferrosa
scripts/                 Local generation, validation, and sync helpers
specs/                   Architecture notes for this docs repo
```

## Adding a docs page

Documentation lives under `docs/productdocs/<product>/`. Every page shares one
stylesheet, `docs/productdocs/docs.css` — pages carry no `<style>` block of their
own unless they genuinely need a rule the stylesheet does not provide.

To add a page:

1. Copy `docs/productdocs/database/_template.html` to `docs/productdocs/<product>/<name>.html`.
   Its relative paths are already correct for any product directory.
2. Replace the `<title>`, the `<meta name="description">` and the body. Leave the
   header, the footer and the `<!-- docs-* -->` marker comments exactly as they are.
3. Add one entry to that product's `pages` array in `docs/productdocs/nav.json`, in
   reading order. The label should match the page's own `<h1>`.
4. Run `python3 scripts/build-docs-nav.py`. It writes the sidebar and the prev/next
   links into every page and rebuilds the print view.
5. Run `python3 scripts/check-site.py` and confirm it prints `site check passed`.

Notes:

- Do not add colour literals to a page. Use the tokens in `docs.css`; they are the
  Ferrosa AI design system (see `docs/design-system.html`).
- **Everything between the `<!-- docs-sidebar:start/end -->` and
  `<!-- docs-prevnext:start/end -->` markers is generated, and so is
  `docs/productdocs/database/print.html`.** Hand-edits there are overwritten on the
  next run, and CI regenerates and fails on drift. Change `nav.json` instead.
- The generator is idempotent, and it skips files whose name starts with `_`, so the
  template keeps its markers empty for the next page copied from it.
- `docs/productdocs/index.html` and `docs/productdocs/database/index.html` are
  meta-refresh stubs onto Getting Started — the docs open on the first page rather
  than on a table of contents. They carry no markers and the generator skips them.
- Pages that moved out of `docs/database/` left redirect stubs behind at their old
  URLs. Those stubs must stay: the generated Asciidoctor examples link to the old
  paths, and that HTML cannot be hand-edited.

## Local Checks

Install Asciidoctor when regenerating example docs:

```bash
gem install asciidoctor -v 2.0.20 --no-document
```

Run the docs checks:

```bash
scripts/generate-example-docs.sh
python3 scripts/build-docs-nav.py
scripts/check-site.py
node scripts/check-design-system-contrast.mjs
node scripts/check-brand-contrast.mjs
git diff --check
```

The two contrast checks read the token blocks out of `docs/ferrosa-memory/design-system.html`
and `docs/design-system.html` and assert every foreground/background pair meets WCAG 2.1 AA
in both themes. Each prints `39 combinations checked, 0 below AA.` and exits non-zero on the
first pair below threshold. They need Node 18 or newer and use only the standard library.

This repo now OWNS docs/ (the marketing site moved off ferrosadb/ferrosa). `sync-from-ferrosa.sh` no longer pulls docs/ by default — only the example SOURCES (sources/ferrosa/examples) track the engine repo. Use `--with-docs` only for a deliberate full re-mirror.

`scripts/generate-example-docs.sh` regenerates `docs/database/examples/*.html`
from `sources/ferrosa/examples/**/*.adoc`. CI fails if generated HTML drifts
from the checked-in source.

`scripts/build-docs-nav.py` regenerates the docs sidebar, the prev/next links and
`docs/productdocs/database/print.html` from `docs/productdocs/nav.json`. CI fails
the same way if `docs/productdocs/` drifts from `nav.json`.

## Sync From Product Repos

To refresh from Ferrosa manually:

```bash
scripts/sync-from-ferrosa.sh --ref main
scripts/generate-example-docs.sh
scripts/check-site.py
```

The `Sync Ferrosa Docs Sources` workflow can also clone `ferrosadb/ferrosa`,
copy `docs/` and `examples/`, regenerate example HTML, and open a docs PR.

## Deployment

GitHub Pages deploys the checked-in `docs/` directory on pushes to `main`.
Release pointer files such as `docs/LATEST`, `docs/setup.sh`, and
`docs/setup-memory.sh` are website-owned here, so release documentation and
installer pointers can ship independently from engine CI.

## Production Cutover

When ready to move production traffic:

1. Confirm the latest `Deploy Docs` workflow is green in this repository.
2. Disable or remove the `www.ferrosadb.com` Pages custom domain from
   `ferrosadb/ferrosa`.
3. Configure this repository's Pages custom domain as `www.ferrosadb.com`.
4. Confirm GitHub Pages reports the certificate as approved and HTTPS enforced.
5. Keep `ferrosadb/ferrosa` docs workflows limited to source generation or sync
   dispatches, not production deployment.
