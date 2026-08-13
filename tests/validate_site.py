#!/usr/bin/env python3
"""Dependency-free release checks for the GalileoEngine presentation website."""

from __future__ import annotations

import argparse
import sys
import urllib.error
import urllib.request
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin, urlparse


ROOT = Path(__file__).resolve().parents[1]
PUBLIC_PAGES = (
    "index.html",
    "platform.html",
    "roadmap.html",
    "galileo-browser.html",
    "status.html",
    "team.html",
    "support.html",
    "journal/index.html",
    "404.html",
)
REDIRECT_PAGES = {
    "Home.dc.html": "index.html",
    "About.dc.html": "platform.html",
    "Build.dc.html": "platform.html",
    "Goals.dc.html": "roadmap.html",
    "Contribute.dc.html": "roadmap.html",
    "Status.dc.html": "status.html",
    "Team.dc.html": "team.html",
    "products.html": "galileo-browser.html",
}
REQUIRED_ASSETS = (
    "galileo.css",
    "site.js",
    "assets/galileo-symbol.png",
    "team-loren.png",
    "team-manuel.png",
    "team-silviu.png",
    "robots.txt",
    "sitemap.xml",
    ".nojekyll",
)
TEXT_SUFFIXES = {".css", ".html", ".ini", ".js", ".json", ".md", ".txt", ".xml", ".yaml", ".yml"}
IGNORED_DIRECTORIES = {".git", ".next", "__pycache__", "dist", "node_modules", "output", "public"}
PROHIBITED_TERMS = ("step" + "perengine", "step" + "per", "vo" + "lt")
PLACEHOLDER_MARKERS = ("galileo://start", "Interface concept", "browser-concept")


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.attrs: list[tuple[str, str, dict[str, str]]] = []
        self.ids: list[str] = []
        self.tags: Counter[str] = Counter()
        self.title_depth = 0
        self.title = ""
        self.h1_depth = 0
        self.h1_text: list[str] = []
        self.description = ""
        self.lang = ""

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key: value or "" for key, value in attrs}
        self.tags[tag] += 1
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


def parse_page(path: Path) -> tuple[str, PageParser]:
    text = path.read_text(encoding="utf-8")
    parser = PageParser()
    parser.feed(text)
    parser.close()
    return text, parser


def check_local_reference(source: Path, raw_value: str) -> str | None:
    value = raw_value.strip()
    if not value or value.startswith(("#", "data:", "mailto:", "tel:")):
        return None
    if value.lower().startswith("javascript:"):
        return f"javascript URL is not allowed: {value}"
    parsed = urlparse(value)
    if parsed.scheme or parsed.netloc:
        return None
    path = unquote(parsed.path)
    if not path:
        return None
    target = (source.parent / path).resolve()
    if target.is_dir():
        target = target / "index.html"
    try:
        target.relative_to(ROOT)
    except ValueError:
        return f"reference escapes the site root: {value}"
    if not target.is_file():
        return f"missing local target: {value}"
    return None


def iter_project_files() -> list[Path]:
    return [
        path
        for path in ROOT.rglob("*")
        if path.is_file() and not any(part in IGNORED_DIRECTORIES for part in path.relative_to(ROOT).parts)
    ]


def validate_brand_cleanup() -> list[str]:
    errors: list[str] = []
    for path in iter_project_files():
        relative = path.relative_to(ROOT).as_posix()
        lower_name = relative.lower()
        for term in PROHIBITED_TERMS:
            if term in lower_name:
                errors.append(f"{relative}: retired brand remains in file name")
        if path.suffix.lower() not in TEXT_SUFFIXES and path.name != ".gitignore":
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            errors.append(f"{relative}: expected UTF-8 text")
            continue
        lower_text = text.lower()
        for term in PROHIBITED_TERMS:
            if term in lower_text:
                errors.append(f"{relative}: retired brand remains in file content")
    return errors


def validate_public_page(relative: str) -> list[str]:
    errors: list[str] = []
    path = ROOT / relative
    if not path.is_file():
        return [f"{relative}: required page is missing"]

    text, parser = parse_page(path)
    if parser.lang != "en":
        errors.append(f'{relative}: expected <html lang="en">')
    if not parser.title.strip():
        errors.append(f"{relative}: missing document title")
    if not parser.description:
        errors.append(f"{relative}: missing meta description")
    for landmark in ("header", "main", "nav", "h1"):
        if parser.tags[landmark] != 1:
            errors.append(f"{relative}: expected exactly one <{landmark}>")
    if relative != "404.html" and parser.tags["footer"] != 1:
        errors.append(f"{relative}: expected exactly one <footer>")
    if parser.tags["h1"] != 1:
        errors.append(f"{relative}: expected exactly one <h1>")

    for item, count in Counter(parser.ids).items():
        if count > 1:
            errors.append(f"{relative}: duplicate id {item!r}")

    for tag, value, attrs in parser.attrs:
        if tag in {"a", "img", "script", "link"}:
            issue = check_local_reference(path, value)
            if issue:
                errors.append(f"{relative}: {issue}")
        if tag == "img" and "alt" not in attrs:
            errors.append(f"{relative}: image is missing an alt attribute")
        if tag == "button" and not attrs.get("type"):
            errors.append(f"{relative}: button is missing an explicit type")
        if tag == "script" and attrs.get("src") and "defer" not in attrs:
            errors.append(f"{relative}: external script is not deferred")

    if text.count('aria-current="page"') > 1:
        errors.append(f"{relative}: more than one current-page marker")
    prefix = "../" if relative == "journal/index.html" else ""
    if f'href="{prefix}team.html"' not in text:
        errors.append(f"{relative}: Team navigation link is missing")
    if f'<a class="nav-support" href="{prefix}support.html"' not in text or "Contribute to the project</a>" not in text:
        errors.append(f"{relative}: Contribute navigation link is missing or mislabeled")
    if f'href="{prefix}roadmap.html"' not in text or "Roadmap</a>" not in text:
        errors.append(f"{relative}: Roadmap navigation link is missing or mislabeled")
    discussions_href = "./" if relative == "journal/index.html" else "journal"
    if f'href="{discussions_href}"' not in text or "Discussions</a>" not in text:
        errors.append(f"{relative}: Discussions navigation link is missing or mislabeled")
    if "family=Manrope" not in text:
        errors.append(f"{relative}: Manrope font request is missing")
    if f'href="{prefix}galileo.css?' not in text or f'src="{prefix}site.js?' not in text:
        errors.append(f"{relative}: versioned public CSS or JavaScript reference is missing")
    if 'meta http-equiv="refresh"' in text.lower():
        errors.append(f"{relative}: public page must not use a meta refresh")
    if 'name="theme-color"' not in text:
        errors.append(f"{relative}: theme color metadata is missing")
    if relative != "404.html":
        canonical = "https://galileobrowser.com/"
        if relative == "index.html":
            expected_url = canonical
        elif relative == "journal/index.html":
            expected_url = canonical + "journal/"
        else:
            expected_url = canonical + relative
        if f'<link rel="canonical" href="{expected_url}">' not in text:
            errors.append(f"{relative}: canonical URL is missing or incorrect")
        if f'<meta property="og:url" content="{expected_url}">' not in text:
            errors.append(f"{relative}: Open Graph URL is missing or incorrect")
        if 'property="og:image"' not in text or 'name="twitter:card"' not in text:
            errors.append(f"{relative}: social sharing metadata is incomplete")
    if "<image-slot" in text:
        errors.append(f"{relative}: editor-only image slot remains")
    for marker in PLACEHOLDER_MARKERS:
        if marker in text:
            errors.append(f"{relative}: placeholder marker remains: {marker!r}")

    if relative == "index.html":
        for marker in ("GalileoEngine", "Galileo Browser", "Servo", "assets/galileo-symbol.png"):
            if marker not in text:
                errors.append(f"{relative}: identity marker is missing {marker!r}")
    elif relative == "galileo-browser.html":
        for marker in ("Desktop browser / in development", "In development", "No public release"):
            if marker not in text:
                errors.append(f"{relative}: product boundary is missing {marker!r}")
    elif relative == "team.html":
        for person in ("Loren Bufanu", "Ionel Silviu Ghimpau", "Manuel Ionasel"):
            if person not in text:
                errors.append(f"{relative}: team member is missing {person!r}")
        for email in (
            "loren@galileobrowser.com",
            "silviu@galileobrowser.com",
            "manuel@galileobrowser.com",
        ):
            if f'href="mailto:{email}"' not in text:
                errors.append(f"{relative}: team contact is missing {email!r}")
    elif relative == "support.html":
        for marker in ("Contribute code", "Fund the work", "We are not accepting money yet", "GitHub Sponsors pending"):
            if marker not in text:
                errors.append(f"{relative}: support boundary is missing {marker!r}")
    elif relative == "journal/index.html":
        for marker in (
            "GitHub Discussions",
            "JOURNAL_ENTRIES_START",
            "github.com/GalileoBrowser/galileoengine-site-v2/discussions/categories/announcements",
        ):
            if marker not in text:
                errors.append(f"{relative}: Journal integration marker is missing {marker!r}")

    return errors


def validate_redirects() -> list[str]:
    errors: list[str] = []
    for relative, destination in REDIRECT_PAGES.items():
        path = ROOT / relative
        if not path.is_file():
            errors.append(f"{relative}: compatibility redirect is missing")
            continue
        text, parser = parse_page(path)
        if f'content="0; url={destination}"' not in text:
            errors.append(f"{relative}: redirect does not target {destination}")
        if f'href="{destination}"' not in text:
            errors.append(f"{relative}: canonical or fallback link to {destination} is missing")
        if 'name="robots" content="noindex"' not in text:
            errors.append(f"{relative}: redirect must be excluded from indexing")
        if parser.tags["h1"] != 1:
            errors.append(f"{relative}: redirect must contain one fallback heading")
        for tag, value, _attrs in parser.attrs:
            if tag in {"a", "img", "link"}:
                issue = check_local_reference(path, value)
                if issue:
                    errors.append(f"{relative}: {issue}")
    return errors


def validate_files() -> list[str]:
    errors = validate_brand_cleanup()
    for relative in REQUIRED_ASSETS:
        if not (ROOT / relative).is_file():
            errors.append(f"{relative}: required asset is missing")
    for relative in PUBLIC_PAGES:
        errors.extend(validate_public_page(relative))
    errors.extend(validate_redirects())
    return errors


def fetch(url: str) -> tuple[int, str, int]:
    request = urllib.request.Request(url, headers={"User-Agent": "GalileoEngine-site-validator/1.0"})
    with urllib.request.urlopen(request, timeout=10) as response:
        return response.status, response.headers.get_content_type(), len(response.read())


def smoke_http(base_url: str) -> list[str]:
    errors: list[str] = []
    expected = {
        **{
            ("journal/" if page == "journal/index.html" else page): "text/html"
            for page in PUBLIC_PAGES
        },
        **{page: "text/html" for page in REDIRECT_PAGES},
        "galileo.css": "text/css",
        "site.js": ("application/javascript", "text/javascript"),
        "assets/galileo-symbol.png": "image/png",
        "team-loren.png": "image/png",
        "team-manuel.png": "image/png",
        "team-silviu.png": "image/png",
        "robots.txt": "text/plain",
        "sitemap.xml": ("application/xml", "text/xml"),
    }
    for relative, expected_type in expected.items():
        url = urljoin(base_url.rstrip("/") + "/", relative)
        try:
            status, content_type, size = fetch(url)
            if status != 200:
                errors.append(f"{relative}: HTTP {status}")
            accepted_types = (expected_type,) if isinstance(expected_type, str) else expected_type
            if content_type not in accepted_types:
                errors.append(f"{relative}: expected {' or '.join(accepted_types)}, received {content_type}")
            if size == 0:
                errors.append(f"{relative}: HTTP response is empty")
        except (urllib.error.URLError, TimeoutError) as exc:
            errors.append(f"{relative}: HTTP smoke failed: {exc}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", help="Also test every page and runtime asset through an HTTP server")
    args = parser.parse_args()

    errors = validate_files()
    if args.base_url:
        errors.extend(smoke_http(args.base_url))

    if errors:
        print(f"FAILED: {len(errors)} site validation error(s)", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    mode = "structure, brand, links, accessibility basics, and HTTP" if args.base_url else "structure, brand, links, and accessibility basics"
    print(f"PASS: {len(PUBLIC_PAGES)} public pages and {len(REDIRECT_PAGES)} redirects passed {mode}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
