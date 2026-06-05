# Ferrosa Docs

Standalone website and documentation repository for Ferrosa Database and Ferrosa Memory.

This repository owns the deployable `ferrosadb.com` static site under `docs/`.
It is intentionally separate from the Ferrosa engine repositories so website
updates are not blocked by unrelated storage, cluster, or CQL CI failures.

## Layout

```text
docs/                    Published static site and installer scripts
sources/ferrosa/examples  AsciiDoc example sources mirrored from ferrosadb/ferrosa
scripts/                 Local generation, validation, and sync helpers
specs/                   Architecture notes for this docs repo
```

## Local Checks

Install Asciidoctor when regenerating example docs:

```bash
gem install asciidoctor -v 2.0.20 --no-document
```

Run the docs checks:

```bash
scripts/generate-example-docs.sh
scripts/check-site.py
git diff --check
```

`scripts/generate-example-docs.sh` regenerates `docs/database/examples/*.html`
from `sources/ferrosa/examples/**/*.adoc`. CI fails if generated HTML drifts
from the checked-in source.

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

