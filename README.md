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

## Production Cutover

When ready to move production traffic:

1. Confirm the latest `Deploy Docs` workflow is green in this repository.
2. Disable or remove the `www.ferrosadb.com` Pages custom domain from
   `ferrosadb/ferrosa`.
3. Configure this repository's Pages custom domain as `www.ferrosadb.com`.
4. Confirm GitHub Pages reports the certificate as approved and HTTPS enforced.
5. Keep `ferrosadb/ferrosa` docs workflows limited to source generation or sync
   dispatches, not production deployment.
