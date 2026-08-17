#!/usr/bin/env python3
"""Generate the product-documentation navigation from docs/productdocs/nav.json.

nav.json is the single source of truth. This script writes three things:

  * the sidebar, between the <!-- docs-sidebar:start/end --> markers on every
    docs page, with hrefs made relative to each page's own depth
  * prev/next links, between the <!-- docs-prevnext:start/end --> markers
  * docs/productdocs/<product>/print.html for products marked "print": true —
    every chapter concatenated into one noindex page

It is idempotent: running it twice produces no diff. CI runs it and fails on
drift, the same way it does for the generated Asciidoctor examples.

Pages are discovered by the presence of the sidebar markers, so redirect stubs
(which have no markers) are skipped automatically. Files whose name starts with
an underscore are templates and are left with empty markers, so that a page
copied from one picks up its nav on the next run.
"""
from __future__ import annotations

import html
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
PRODUCTDOCS = DOCS / "productdocs"
NAV_JSON = PRODUCTDOCS / "nav.json"

SIDEBAR_MARKERS = ("<!-- docs-sidebar:start -->", "<!-- docs-sidebar:end -->")
PREVNEXT_MARKERS = ("<!-- docs-prevnext:start -->", "<!-- docs-prevnext:end -->")
PRINT_MARKERS = ("<!-- docs-print:start -->", "<!-- docs-print:end -->")

PRINT_FILE = "print.html"

# Printer glyph, sized and shaped like the GitHub and Discord icons beside it.
PRINT_ICON = (
    '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">'
    '<path d="M4 1h8a1 1 0 0 1 1 1v3h1a2 2 0 0 1 2 2v4a1 1 0 0 1-1 1h-2v2a1 1 0 0 1-1 1H4a1 1'
    " 0 0 1-1-1v-2H1a1 1 0 0 1-1-1V7a2 2 0 0 1 2-2h1V2a1 1 0 0 1 1-1Zm8 4V2H4v3h8ZM4 11v3h8v-3H4Z"
    'm9.5-3.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z"/></svg>'
)

# ── nav.json → resolved model ───────────────────────────────────────────────


class Page:
    def __init__(self, product: "Product", entry: dict, number: int) -> None:
        self.product = product
        self.label = entry["label"]
        self.number = number
        self.external = bool(entry.get("external"))
        self.raw = entry["file"]
        self.is_dir = self.raw.endswith("/")
        self.path = Path(os.path.normpath(product.dir / self.raw))

    @property
    def slug(self) -> str:
        return self.path.stem


class Product:
    def __init__(self, entry: dict) -> None:
        self.slug = entry["slug"]
        self.label = entry["label"]
        self.status = entry["status"]
        self.print = bool(entry.get("print"))
        self.dir = Path(os.path.normpath(PRODUCTDOCS / entry["href"]))
        self.pages = [Page(self, p, i + 1) for i, p in enumerate(entry["pages"])]

    @property
    def chapters(self) -> list[Page]:
        """Pages in the prev/next chain and the print view.

        External entries are excluded: Tutorials & Examples is Asciidoctor
        output we cannot add a "next" link to, and cannot inline into print.
        """
        return [p for p in self.pages if not p.external]

    @property
    def print_path(self) -> Path:
        return self.dir / PRINT_FILE


def load_products() -> list[Product]:
    data = json.loads(NAV_JSON.read_text(encoding="utf-8"))
    return [Product(p) for p in data["products"]]


# ── href helpers ────────────────────────────────────────────────────────────


def href(target: Path, from_dir: Path, is_dir: bool = False) -> str:
    rel = os.path.relpath(target, from_dir)
    return rel + "/" if is_dir else rel


# ── sidebar ─────────────────────────────────────────────────────────────────

TOGGLE_SCRIPT = """<script>
(function () {
  var toggle = document.querySelector('.sidebar-toggle');
  var nav = document.getElementById('docs-nav');
  if (!toggle || !nav) return;
  function close() {
    document.body.classList.remove('nav-open');
    toggle.setAttribute('aria-expanded', 'false');
  }
  toggle.addEventListener('click', function () {
    var open = document.body.classList.toggle('nav-open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  nav.addEventListener('click', function (e) {
    if (e.target.closest('a')) close();
  });
  document.addEventListener('click', function (e) {
    if (!document.body.classList.contains('nav-open')) return;
    if (nav.contains(e.target) || toggle.contains(e.target)) return;
    close();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close();
  });
  // Every chapter is expanded, so the rail is taller than the viewport and the
  // page you are on can start out scrolled past. Bring it into view inside the
  // rail only — never scrollIntoView, which would move the page as well.
  // On DOMContentLoaded, not requestAnimationFrame: this script runs mid-parse,
  // and at the first frame the rail is not yet scrollable, so the assignment
  // clamps to 0 and nothing moves.
  function revealCurrent() {
    var here = nav.querySelector('[aria-current="page"]');
    if (!here) return;
    var top = here.offsetTop - nav.clientHeight / 3;
    if (top > 0) nav.scrollTop = top;
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', revealCurrent);
  } else {
    revealCurrent();
  }
})();
</script>"""


SECTION_H2 = re.compile(r'<h2 id="([^"]+)"[^>]*>(.*?)</h2>', re.DOTALL)
TAGS = re.compile(r"<[^>]+>")


def page_sections(path: Path) -> list[tuple[str, str]]:
    """A page's own <h2 id> sections — the same list its "On this page" box
    carries. Only ids already in the page are used: giving an unlinkable
    heading an id would be a content edit, which this script never makes.
    (sparql.html and releases.html have no such ids, so they get no sections.)

    Read from the page's .container, which this script never writes into, so
    the result does not depend on whether that page has been regenerated yet.
    """
    body = container_inner(path.read_text(encoding="utf-8"), path)
    return [
        (anchor, TAGS.sub("", raw).strip())
        for anchor, raw in SECTION_H2.findall(body)
    ]


def section_index(products: list[Product]) -> dict[Path, list[tuple[str, str]]]:
    """Every chapter's sections, collected up front so the sidebar is identical
    whichever page is being written."""
    return {
        chapter.path: page_sections(chapter.path)
        for product in products
        for chapter in product.chapters
        if chapter.path.exists()
    }


def sidebar_html(
    products: list[Product],
    page_path: Path,
    sections: dict[Path, list[tuple[str, str]]],
) -> str:
    page_dir = page_path.parent
    lines = [
        '<aside class="docs-sidebar" id="docs-nav">',
        '  <nav aria-label="Documentation">',
        '    <ul class="docs-nav">',
    ]

    for product in products:
        current_product = page_dir == product.dir
        lines.append('      <li class="docs-nav-product">')

        classes = ["docs-nav-title"]
        if current_product:
            classes.append("is-current")
        if product.status == "coming-soon":
            classes.append("is-soon")
        soon = (
            ' <span class="docs-nav-soon">Coming soon</span>'
            if product.status == "coming-soon"
            else ""
        )

        if current_product:
            # No self-link: the pages below are this product's contents.
            lines.append(
                f'        <span class="{" ".join(classes)}" aria-current="true">'
                f"{product.label}{soon}</span>"
            )
        else:
            # Land on the product's first page where it has one, so the link
            # does not bounce through the index redirect.
            if product.chapters:
                target = href(product.chapters[0].path, page_dir)
            else:
                target = href(product.dir, page_dir, is_dir=True)
            lines.append(
                f'        <a class="{" ".join(classes)}" href="{target}">'
                f"{product.label}{soon}</a>"
            )

        # (href, number, label, external, path-or-None)
        entries: list[tuple[str, str, str, bool, Path | None]] = []
        for page in product.pages:
            entries.append(
                (
                    href(page.path, page_dir, is_dir=page.is_dir),
                    f"{page.number:02d}",
                    page.label,
                    page.external,
                    None if page.external else page.path,
                )
            )
        # Print is not a chapter — it lives in the header actions, top right,
        # where the Rust book puts it.

        if entries:
            lines.append('        <ul class="docs-nav-pages">')
            for target, number, label, external, path in entries:
                current_page = path == page_path
                here = ' aria-current="page"' if current_page else ""
                num = f'<span class="n">{number}</span>' if number else '<span class="n"></span>'
                ext = ' <span class="ext">&#8599;</span>' if external else ""
                open_li = (
                    f'          <li><a href="{target}"{here}>{num}{label}{ext}</a>'
                )
                # Every chapter is expanded, as in the Rust book, whether or not
                # it is the one you are on. Sections on other chapters are
                # in-page anchors on those pages, so they carry the filename;
                # the current chapter's are bare fragments.
                page_secs = sections.get(path, []) if path else []
                if not page_secs:
                    lines.append(open_li + "</li>")
                    continue
                prefix = "" if current_page else target
                lines.append(open_li)
                lines.append('            <ul class="docs-nav-sections">')
                for anchor, text in page_secs:
                    lines.append(
                        f'              <li><a href="{prefix}#{anchor}">{text}</a></li>'
                    )
                lines.append("            </ul>")
                lines.append("          </li>")
            lines.append("        </ul>")

        lines.append("      </li>")

    lines += ["    </ul>", "  </nav>", "</aside>", TOGGLE_SCRIPT]
    return "\n".join(lines)


# ── prev / next ─────────────────────────────────────────────────────────────


def print_action_html(products: list[Product], page_path: Path) -> str:
    """The header's print link, for pages belonging to a product that has a
    print view. Coming-soon products have nothing to print, so they get
    nothing rather than a link to an empty page."""
    for product in products:
        if product.print and page_path.parent == product.dir:
            target = href(product.print_path, page_path.parent)
            return (
                f'<a href="{target}" aria-label="Print this documentation" '
                f'title="Print this documentation">{PRINT_ICON}</a>'
            )
    return ""


def prevnext_html(products: list[Product], page_path: Path) -> str:
    for product in products:
        chapters = product.chapters
        for i, chapter in enumerate(chapters):
            if chapter.path != page_path:
                continue
            prev = chapters[i - 1] if i > 0 else None
            nxt = chapters[i + 1] if i + 1 < len(chapters) else None
            if not prev and not nxt:
                return ""
            lines = ['<nav class="docs-prevnext" aria-label="Chapter navigation">']
            if prev:
                lines.append(
                    f'  <a class="docs-prev" rel="prev" '
                    f'href="{href(prev.path, page_path.parent)}">'
                    f'<span class="dir">&#8592; Previous</span>'
                    f'<span class="lbl">{prev.label}</span></a>'
                )
            if nxt:
                lines.append(
                    f'  <a class="docs-next" rel="next" '
                    f'href="{href(nxt.path, page_path.parent)}">'
                    f'<span class="dir">Next &#8594;</span>'
                    f'<span class="lbl">{nxt.label}</span></a>'
                )
            lines.append("</nav>")
            return "\n".join(lines)
    return ""


# ── writing into the markers ────────────────────────────────────────────────


def replace_between(
    text: str, markers: tuple[str, str], body: str, path: Path, indent: str = ""
) -> str:
    start, end = markers
    i = text.find(start)
    j = text.find(end)
    if i == -1 or j == -1 or j < i:
        raise SystemExit(f"{path}: missing or malformed {start} … {end} markers")
    if body:
        lines = "\n".join(indent + line for line in body.split("\n"))
        inner = f"\n{lines}\n{indent}"
    else:
        inner = ""
    return text[: i + len(start)] + inner + text[j:]


# ── container extraction, for the print view ────────────────────────────────

CONTAINER_OPEN = re.compile(r'<div class="container">')
DIV_TOKEN = re.compile(r"<div\b|</div>", re.IGNORECASE)
PREVNEXT_BLOCK = re.compile(
    re.escape(PREVNEXT_MARKERS[0]) + r".*?" + re.escape(PREVNEXT_MARKERS[1]),
    re.DOTALL,
)


def container_inner(text: str, path: Path) -> str:
    """Inner HTML of the page's .container.

    The close is found by matching <div> nesting. rindex('</div>') would find
    the footer's closing tag and silently return the whole rest of the page.
    """
    m = CONTAINER_OPEN.search(text)
    if not m:
        raise SystemExit(f"{path}: no <div class=\"container\">")
    depth = 1
    pos = m.end()
    for tok in DIV_TOKEN.finditer(text, pos):
        depth += 1 if tok.group(0).lower().startswith("<div") else -1
        if depth == 0:
            return text[pos : tok.start()]
    raise SystemExit(f"{path}: unbalanced <div> inside .container")


ID_ATTR = re.compile(r'(\sid=")([^"]+)(")')
HASH_HREF = re.compile(r'(\shref="#)([^"]+)(")')


def namespace_anchors(fragment: str, prefix: str) -> str:
    """Prefix ids and same-page anchors so concatenated chapters stay unique."""
    fragment = ID_ATTR.sub(lambda m: f"{m.group(1)}{prefix}--{m.group(2)}{m.group(3)}", fragment)
    return HASH_HREF.sub(lambda m: f"{m.group(1)}{prefix}--{m.group(2)}{m.group(3)}", fragment)


# ── print view ──────────────────────────────────────────────────────────────

PRINT_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title} — Ferrosa AI</title>
  <meta name="robots" content="noindex">
  <link rel="icon" type="image/svg+xml" href="{root}favicon.svg">
  <link rel="stylesheet" href="{root}productdocs/docs.css">
</head>
<body class="docs-print">

<div class="container">

  <h1>{title}</h1>

  <ul class="docs-index print-toc">
{toc}
  </ul>

{chapters}
</div>

<script>
// The header's print icon links here, and this page opens the print dialog by
// itself — the same thing the Rust book's print.html does. On 'load' rather
// than DOMContentLoaded so fonts and layout have settled before the preview is
// rendered. The page stays readable on screen if the dialog is cancelled.
window.addEventListener('load', function () {{ window.print(); }});
</script>

</body>
</html>
"""


def build_print(product: Product) -> None:
    root = os.path.relpath(DOCS, product.dir) + "/"
    toc, chapters = [], []

    for chapter in product.chapters:
        text = chapter.path.read_text(encoding="utf-8")
        inner = PREVNEXT_BLOCK.sub("", container_inner(text, chapter.path)).rstrip()
        inner = namespace_anchors(inner, chapter.slug)
        # No numbers here: the print view drops the external Tutorials &
        # Examples entry, so sidebar numbering would show a phantom gap.
        toc.append(f'    <li><a href="#{chapter.slug}">{chapter.label}</a></li>')
        chapters.append(
            f'  <article class="print-chapter" id="{chapter.slug}">\n{inner}\n  </article>'
        )

    product.print_path.write_text(
        PRINT_TEMPLATE.format(
            title=html.escape(product.label),
            root=root,
            toc="\n".join(toc),
            chapters="\n\n".join(chapters),
        ),
        encoding="utf-8",
    )


# ── main ────────────────────────────────────────────────────────────────────


def target_pages() -> list[Path]:
    pages = []
    for path in sorted(PRODUCTDOCS.rglob("*.html")):
        if path.name.startswith("_") or path.name == PRINT_FILE:
            continue
        if SIDEBAR_MARKERS[0] not in path.read_text(encoding="utf-8"):
            continue
        pages.append(path)
    return pages


def main() -> int:
    products = load_products()

    for product in products:
        if product.print:
            build_print(product)

    sections = section_index(products)

    written = 0
    for path in target_pages():
        original = path.read_text(encoding="utf-8")
        text = replace_between(
            original, SIDEBAR_MARKERS, sidebar_html(products, path, sections), path
        )
        text = replace_between(
            text, PREVNEXT_MARKERS, prevnext_html(products, path), path
        )
        if PRINT_MARKERS[0] in text:
            text = replace_between(
                text,
                PRINT_MARKERS,
                print_action_html(products, path),
                path,
                indent="      ",
            )
        if text != original:
            path.write_text(text, encoding="utf-8")
            written += 1

    print(
        f"docs nav built: {len(target_pages())} pages "
        f"({written} changed), "
        f"{sum(1 for p in products if p.print)} print view(s)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
