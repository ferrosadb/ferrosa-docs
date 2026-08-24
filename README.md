# Ferrosa Docs

Standalone website and documentation repository for Ferrosa Database and Ferrosa Memory.

This repository owns the standalone deployable static site under `docs/`.
It is intentionally separate from the Ferrosa engine repositories so website
updates are not blocked by unrelated storage, cluster, or CQL CI failures.

Production URL: <https://www.ferrosa.ai/>

This repository owns the deployed site. The cutover from the legacy
`ferrosadb/ferrosa` Pages site is complete, and the custom domain moved from
`www.ferrosadb.com` to `www.ferrosa.ai` on 2026-08-24; `ferrosadb.com`
now 301-redirects here, preserving paths.

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
theme/                   Stylesheet and docinfo for the generated examples (this repo owns it)
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
node scripts/check-contrast.mjs design.config.json

# the two rendered-page gates need the site served and Chrome
(cd docs && python3 -m http.server 8779 &)
node scripts/measure-anatomy.mjs design.config.json
node scripts/find-empty-bands.mjs design.config.json

git diff --check
```

### Design gates

Three checks, all driven by `design.config.json`. They need Node 18+ and (for
the last two) Chrome — no npm install. Each exits non-zero on failure. They are
generalized copies of the `/ferrosa-design` skill's reference implementations,
vendored here because that skill lives in a repo CI cannot check out; keep the
two in step.

| Script | Asserts |
|---|---|
| `check-contrast.mjs` | Every foreground/background pair meets WCAG 2.1 AA, in **every theme block each source declares** — dark, explicit light, and `prefers-color-scheme` — across `docs/design-system.html`, `theme/examples.css` and `docs/site.css`, including syntax colours on the code background. Prints `183 combinations checked, 0 below AA.` |
| `measure-anatomy.mjs` | A shared component computes **identically** across the pages that share it, at desktop and phone widths. It measures computed style in a real browser, so it catches which rule *won* — a specificity tie, a ported bare-element selector — which no stylesheet audit can see. |
| `find-empty-bands.mjs` | No band of dead vertical space over 200px, found by sampling what actually paints rather than by measuring element boxes. |

`check-contrast.mjs` replaced `check-brand-contrast.mjs`, which located theme
blocks with `indexOf` against the raw file. `site.css` documents its three theme
selectors in its header comment, so those mentions were found first: the dark
block resolved to a zero-length slice and every dark pair was silently skipped,
while the third block ran to EOF and gave each token its last value anywhere in
the file. It reported 127 clean comparisons while checking none of the site's
default palette. Blocks are now located in a comment-stripped copy — 183 real
comparisons. (The Ferrosa Memory design system was retired along with its page,
and its `--fm-` checker went with it.)

This repo now OWNS docs/ (the marketing site moved off ferrosadb/ferrosa). `sync-from-ferrosa.sh` no longer pulls docs/ by default — only the example SOURCES (sources/ferrosa/examples) track the engine repo. Use `--with-docs` only for a deliberate full re-mirror.

`scripts/generate-example-docs.sh` regenerates `docs/database/examples/*.html`
from `sources/ferrosa/examples/**/*.adoc`. CI fails if generated HTML drifts
from the checked-in source.

The examples' **content** comes from that synced tree; their **presentation**
comes from `theme/`, which this repo owns:

```text
theme/examples.css          palette, type and layout (Ferrosa AI design system)
theme/docinfo.html          -> <head>: stylesheet, favicon, pre-paint theme script
theme/docinfo-header.html   -> after <body>: site header lockup + theme toggle
theme/docinfo-footer.html   -> before </body>: site footer, theme toggle, copy buttons
```

Keeping the theme here rather than in `sources/ferrosa/examples/theme/` is
deliberate: `sync-from-ferrosa.sh` rsyncs that tree with `--delete`, so a theme
stored there is silently reverted on the next sync.

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

GitHub Pages deploys the checked-in `docs/` directory on pushes to `main`, and
on a daily schedule. Installer scripts such as `docs/setup.sh` and
`docs/setup-memory.sh` are website-owned here, so installer behaviour ships
independently from engine CI.

### Version numbers

No page carries a version literal. Every version on the site is resolved at
**deploy time** from the latest stable public release of each product, so a new
release reaches the site with no commit and no PR — the next scheduled deploy
picks it up.

`scripts/fetch-release-versions.sh` runs in the Pages workflow just before the
artifact is uploaded, and writes four **gitignored build artifacts** into `docs/`:

```text
versions.json    { products: { ferrosa | memory | forge: {tag, version, minor} } }
LATEST           v-prefixed ferrosa tag        — fetched by install.sh / setup.sh
LATEST-MEMORY    v-prefixed ferrosa-memory tag — fetched by install-memory.sh
LATEST-FORGE     v-prefixed forge tag
```

Pages mark the spot with a placeholder and `docs/versions.js` fills it in:

```html
<span class="fv" data-fv="ferrosa" data-fv-suffix=" — " hidden></span>active development
```

- `data-fv` — `ferrosa` | `memory` | `forge`
- `data-fv-part` — `tag` (`v0.19.1`, default) | `version` (`0.19.1`) | `minor` (`0.19`)
- `data-fv-prefix` / `data-fv-suffix` — literal text written around the number

Placeholders ship `hidden` and are revealed only once a real number is in them,
so a failed fetch leaves the sentence reading correctly rather than showing a
stale number or a dangling separator. The failure is logged to the console and
stamped on `<html>` as `data-fv-state="error"`. If a release feed is unreachable
the script exits non-zero, which **fails the deploy** instead of publishing a
site with missing versions.

To see real numbers in a local preview, run the script first — it needs `gh`
authenticated, and writes into your working tree:

```bash
scripts/fetch-release-versions.sh
```

Release-note sections (`What's new in vX.Y.Z`) are deliberately **not** wired to
this. They describe one specific release, so filling them from "latest" would
put the wrong heading over the right content.

## Production

The site is live at <https://www.ferrosa.ai/>, deployed from this repository.

This repo uses a **GitHub Actions** Pages deployment (`upload-pages-artifact` +
`deploy-pages`), so `docs/CNAME` does NOT control the custom domain — that is a
repository setting. Changing the file alone has no effect; the domain must be
set in Settings → Pages (or via `PUT /repos/{owner}/{repo}/pages`), and a fresh
deployment run is needed before the new hostname serves.

`ferrosadb.com` and `www.ferrosadb.com` 301-redirect here via a Cloudflare
Redirect Rule that preserves the path. That matters beyond tidiness: this site
also serves the install and update endpoints (`/LATEST`, `/install.sh`,
`/install-memory.sh`, `/setup.sh`, `/setup-memory.sh`), which are compiled into
already-installed clients. Those clients fetch with `curl -fsSL` and follow the
redirect, so the old domain must keep resolving and redirecting indefinitely.
