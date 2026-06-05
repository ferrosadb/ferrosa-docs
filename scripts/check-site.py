#!/usr/bin/env python3
from __future__ import annotations

import html.parser
import sys
import urllib.parse
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"


class SiteParser(html.parser.HTMLParser):
    def __init__(self, path: Path) -> None:
        super().__init__()
        self.path = path
        self.refs: list[tuple[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        for key, value in attrs:
            if value is None:
                continue
            if key in {"href", "src"}:
                self.refs.append((key, value))


def local_target(source: Path, raw: str) -> Path | None:
    if raw.startswith(("http://", "https://", "mailto:", "tel:", "javascript:")):
        return None
    parsed = urllib.parse.urlparse(raw)
    if not parsed.path:
        return None
    if parsed.path.startswith("/"):
        target = DOCS / parsed.path.lstrip("/")
    else:
        target = source.parent / parsed.path
    if parsed.path.endswith("/"):
        return target / "index.html"
    return target


def exists(target: Path) -> bool:
    if target.exists():
        return True
    if target.suffix == "" and (target / "index.html").exists():
        return True
    return False


def main() -> int:
    errors: list[str] = []
    for path in sorted(DOCS.rglob("*.html")):
        parser = SiteParser(path)
        parser.feed(path.read_text(encoding="utf-8"))
        parser.close()
        for attr, raw in parser.refs:
            target = local_target(path, raw)
            if target is not None and not exists(target):
                rel = path.relative_to(ROOT)
                errors.append(f"{rel}: missing {attr} target {raw!r} -> {target.relative_to(ROOT)}")

    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1
    print("site check passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

