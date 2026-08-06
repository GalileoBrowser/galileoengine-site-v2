#!/usr/bin/env python3
"""Dependency-free structural checks for the Volt static website."""

from __future__ import annotations

import argparse
import sys
import urllib.error
import urllib.request
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin, urlparse


ROOT = Path(__file__).resolve().parents[1]
PUBLIC_PAGES = [
    "index.html",
    "Goals.dc.html",
    "Status.dc.html",
    "Build.dc.html",
    "Contribute.dc.html",
    "About.dc.html",
    "Team.dc.html",
]
REQUIRED_FILES = PUBLIC_PAGES + [
    "Home.dc.html",
    "site.css",
    "site.js",
    "support.js",
    "volt-symbol-on-light.png",
    "volt-wordmark-on-light.png",
    "team-loren.png",
    "team-silviu.png",
]

FORBIDDEN_PLACEHOLDER_MARKERS = (
    "volt://start",
    "Interface concept",
    "browser-concept",
)


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.attrs: list[tuple[str, str, dict[str, str]]] = []
        self.ids: list[str] = []
        self.tags: dict[str, int] = {}
        self.title_depth = 0
        self.title = ""
        self.h1_depth = 0
        self.h1_text: list[str] = []
        self.description = ""
        self.lang = ""

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key: value or "" for key, value in attrs}
        self.tags[tag] = self.tags.get(tag, 0) + 1
        self.attrs.append((tag, values.get("href", "") or values.get("src", ""), values))
        if values.get("id"):
            self.ids.append(values["id"])
        if tag == "html":
            self.lang = values.get("lang", "")
        elif tag == "meta" and values.get("name", "").lower() == "description":
            self.description = values.get("content", "").strip()
        elif tag == "title":
            self.title_depth += 1
        elif tag == "h1":
            self.h1_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag == "title" and self.title_depth:
            self.title_depth -= 1
        elif tag == "h1" and self.h1_depth:
            self.h1_depth -= 1

    def handle_data(self, data: str) -> None:
        if self.title_depth:
            self.title += data
        if self.h1_depth:
            self.h1_text.append(data)


def check_local_reference(source: Path, raw_value: str) -> str | None:
    value = raw_value.strip()
    if not value or value.startswith(("#", "data:", "mailto:", "tel:", "javascript:")):
        return None
    parsed = urlparse(value)
    if parsed.scheme or parsed.netloc:
        return None
    path = unquote(parsed.path)
    if not path:
        return None
    target = (source.parent / path).resolve()
    try:
        target.relative_to(ROOT)
    except ValueError:
        return f"reference escapes the site root: {value}"
    if not target.exists():
        return f"missing local target: {value}"
    return None


def validate_files() -> list[str]:
    errors: list[str] = []
    for relative in REQUIRED_FILES:
        if not (ROOT / relative).is_file():
            errors.append(f"{relative}: required file is missing")

    for relative in PUBLIC_PAGES:
        path = ROOT / relative
        if not path.is_file():
            continue
        parser = PageParser()
        parser.feed(path.read_text(encoding="utf-8"))

        if parser.lang != "en":
            errors.append(f"{relative}: expected <html lang=\"en\">")
        if not parser.title.strip():
            errors.append(f"{relative}: missing document title")
        if not parser.description:
            errors.append(f"{relative}: missing meta description")
        for landmark in ("header", "main", "nav", "footer", "h1"):
            if parser.tags.get(landmark, 0) < 1:
                errors.append(f"{relative}: missing <{landmark}> landmark")
        if parser.tags.get("h1", 0) != 1:
            errors.append(f"{relative}: expected exactly one <h1>")

        duplicate_ids = sorted({item for item in parser.ids if parser.ids.count(item) > 1})
        for item in duplicate_ids:
            errors.append(f"{relative}: duplicate id {item!r}")

        for tag, value, _attrs in parser.attrs:
            if tag not in {"a", "img", "script", "link"}:
                continue
            issue = check_local_reference(path, value)
            if issue:
                errors.append(f"{relative}: {issue}")

        text = path.read_text(encoding="utf-8")
        if "<image-slot" in text:
            errors.append(f"{relative}: editor-only <image-slot> remains in public markup")
        if "Home.dc.html" in text:
            errors.append(f"{relative}: legacy Home.dc.html link remains")

        for marker in FORBIDDEN_PLACEHOLDER_MARKERS:
            if marker in text:
                errors.append(f"{relative}: placeholder marker remains: {marker!r}")

        if 'href="Team.dc.html"' not in text:
            errors.append(f"{relative}: Team navigation link is missing")

        if relative == "index.html":
            for evidence in ("repo-proof", "af08a060", "68", "52", "observed-partial"):
                if evidence not in text:
                    errors.append(f"{relative}: repository evidence is missing {evidence!r}")
        elif relative == "Status.dc.html":
            for evidence in ("68 rows", "52 rows", "0 rows", "af08a060"):
                if evidence not in text:
                    errors.append(f"{relative}: status snapshot is missing {evidence!r}")
        elif relative == "Build.dc.html":
            for command in (
                "./mach build --profile medium --media-stack gstreamer",
                "tools/run-current-build.sh https://example.com/",
                ".\\\\mach run --profile medium -- https://example.com/",
            ):
                if command not in text:
                    errors.append(f"{relative}: current README command is missing {command!r}")
        elif relative == "Team.dc.html":
            for person in ("Loren Bufanu", "Ionel Silviu Ghimpau", "Manuel Condurache"):
                if person not in text:
                    errors.append(f"{relative}: team member is missing {person!r}")
            for profile in ("https://github.com/lolren", "https://github.com/Silviu3369"):
                if profile not in text:
                    errors.append(f"{relative}: verified GitHub profile is missing {profile!r}")

    return errors


def smoke_http(base_url: str) -> list[str]:
    errors: list[str] = []
    for relative in PUBLIC_PAGES:
        url = urljoin(base_url.rstrip("/") + "/", relative)
        try:
            with urllib.request.urlopen(url, timeout=5) as response:
                if response.status != 200:
                    errors.append(f"{relative}: HTTP {response.status}")
                content_type = response.headers.get_content_type()
                if content_type != "text/html":
                    errors.append(f"{relative}: unexpected content type {content_type}")
        except (urllib.error.URLError, TimeoutError) as exc:
            errors.append(f"{relative}: HTTP smoke failed: {exc}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", help="Also smoke-test pages through an already running local server")
    args = parser.parse_args()

    errors = validate_files()
    if args.base_url:
        errors.extend(smoke_http(args.base_url))

    if errors:
        print(f"FAILED: {len(errors)} site validation error(s)", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    mode = "structure + HTTP" if args.base_url else "structure"
    print(f"PASS: {len(PUBLIC_PAGES)} public pages passed {mode} validation")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
