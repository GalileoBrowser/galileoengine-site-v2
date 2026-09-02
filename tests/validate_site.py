#!/usr/bin/env python3
"""Dependency-free release checks for the GalileoEngine presentation website."""

from __future__ import annotations

import argparse
import json
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
    "about.html",
    "get-involved.html",
    "contributing.html",
    "newsletter.html",
    "newsletter/the-browser-project/index.html",
    "404.html",
)
CLEAN_ROUTES = {
    "index.html": "/",
    "platform.html": "/platform/",
    "roadmap.html": "/roadmap/",
    "galileo-browser.html": "/galileo-browser/",
    "about.html": "/about/",
    "get-involved.html": "/get-involved/",
    "contributing.html": "/contributing/",
    "newsletter.html": "/newsletter/",
    "404.html": "/404.html",
}
LEGACY_CLEAN_PAGES = {
    page: route
    for page, route in CLEAN_ROUTES.items()
    if page not in {"index.html", "journal/index.html", "404.html"}
}
CANONICAL_ROUTES = {
    **CLEAN_ROUTES,
    "newsletter/the-browser-project/index.html": "/newsletter/the-browser-project/",
}
REDIRECT_PAGES = {
    "status.html": "/roadmap/#current-status",
    "support.html": "/get-involved/",
    "contact.html": "/about/#contact",
    "team.html": "/about/#team",
    "github.html": "https://github.com/GalileoBrowser",
    "Home.dc.html": "/",
    "About.dc.html": "/about/",
    "Build.dc.html": "/platform/",
    "Goals.dc.html": "/roadmap/",
    "Contribute.dc.html": "/get-involved/",
    "Status.dc.html": "/roadmap/#current-status",
    "Team.dc.html": "/about/#team",
    "products.html": "/galileo-browser/",
    "journal/index.html": "/newsletter/",
}
ROUTE_REDIRECTS = {
    "status": "/roadmap/#current-status",
    "support": "/get-involved/",
    "contact": "/about/#contact",
    "team": "/about/#team",
    "github": "https://github.com/GalileoBrowser",
}
NEWSLETTER_POST_SLUGS = {
    1: "what-we-are-building",
}
REQUIRED_ASSETS = (
    "galileo.css",
    "site.js",
    "evidence-chart.js",
    "assets/galileo-symbol.png",
    "assets/relay-handoff.png",
    "assets/servo-ai-policy.png",
    "assets/ublock-origin-icon.png",
    "team-loren.png",
    "team-manuel.png",
    "team-silviu.png",
    "robots.txt",
    "sitemap.xml",
    ".nojekyll",
    "data/progress/2026-W33.json",
    "data/evidence/2026-W30-phase0-core-fork-base.json",
    "data/evidence/2026-W33-phase0-core-comparison.json",
    "data/evidence/phase0-core-series.json",
    "data/evidence/feature-inventory-series.json",
    "data/evidence/galileo-project-timeline.json",
    "data/galileo-audit.json",
    "data/newsletter-discussions.json",
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


def load_newsletter_snapshot() -> dict:
    path = ROOT / "data/newsletter-discussions.json"
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return {}


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
    if path.startswith("/"):
        matching_source = next((page for page, route in CLEAN_ROUTES.items() if route == path), None)
        target = ROOT / matching_source if matching_source else ROOT / path.lstrip("/")
    else:
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
        if tag == "a":
            parsed_link = urlparse(value)
            if not parsed_link.scheme and not parsed_link.netloc and parsed_link.path.lower().endswith(".html"):
                errors.append(f"{relative}: public link leaks a legacy .html route: {value}")
        if tag == "img" and "alt" not in attrs:
            errors.append(f"{relative}: image is missing an alt attribute")
        if tag == "img" and (not attrs.get("width") or not attrs.get("height")):
            errors.append(f"{relative}: image is missing intrinsic width or height")
        if tag == "button" and not attrs.get("type"):
            errors.append(f"{relative}: button is missing an explicit type")
        if tag == "script" and attrs.get("src") and "defer" not in attrs and "async" not in attrs:
            errors.append(f"{relative}: external script is neither deferred nor asynchronous")

    if text.count('aria-current="page"') > 1:
        errors.append(f"{relative}: more than one current-page marker")
    for href, label in (
        ("/", "Galileo home"),
        ("/platform/", "Galileo Engine"),
        ("/galileo-browser/", "Galileo Browser"),
        ("/roadmap/", "Roadmap"),
        ("/newsletter/", "Newsletter"),
        ("/about/", "About"),
        ("/get-involved/", "Overview"),
        ("/contributing/", "Contributing"),
    ):
        if f'href="{href}"' not in text or label not in text:
            errors.append(f"{relative}: {label} navigation link is missing or mislabeled")
    for marker in (
        'class="site-nav__group" data-nav-group',
        'class="site-nav__trigger" id="nav-get-involved-trigger"',
        'class="site-nav__trigger" id="nav-engine-trigger"',
        'aria-controls="nav-get-involved-menu"',
        'aria-controls="nav-engine-menu"',
        'class="site-nav__link" href="/newsletter/"',
        'class="site-nav__link" href="/about/"',
        'class="github-link github-link--desktop" href="https://github.com/GalileoBrowser"',
    ):
        if marker not in text:
            errors.append(f"{relative}: grouped navigation is missing {marker!r}")
    nav_start = text.find('<nav class="site-nav"')
    nav_end = text.find("</nav>", nav_start)
    nav_text = text[nav_start:nav_end]
    if ">Home</a>" in nav_text:
        errors.append(f"{relative}: Home must be represented by the brand, not a separate navigation link")
    if not (nav_text.find("Get involved") < nav_text.find("Engine") < nav_text.find("Newsletter") < nav_text.find("About")):
        errors.append(f"{relative}: primary navigation order is incorrect")
    for retired_route in ("/status/", "/support/", "/contact/", "/team/", "/github/"):
        if f'href="{retired_route}"' in text:
            errors.append(f"{relative}: retired navigation route remains: {retired_route}")
    if "family=Manrope" not in text:
        errors.append(f"{relative}: Manrope font request is missing")
    if 'href="/galileo.css?' not in text or 'src="/site.js?' not in text:
        errors.append(f"{relative}: versioned public CSS or JavaScript reference is missing")
    if 'meta http-equiv="refresh"' in text.lower():
        errors.append(f"{relative}: public page must not use a meta refresh")
    if 'name="theme-color"' not in text:
        errors.append(f"{relative}: theme color metadata is missing")
    if 'rel="icon"' not in text or 'rel="apple-touch-icon"' not in text:
        errors.append(f"{relative}: favicon metadata is incomplete")
    if relative != "404.html":
        expected_url = "https://galileobrowser.com" + CANONICAL_ROUTES[relative]
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
        for marker in (
            "GalileoEngine",
            "Galileo Engine",
            "Galileo Browser",
            "Servo",
            "assets/galileo-symbol.png",
            "26 Jul 2026",
            "Mozilla Research starts Servo",
            "usable alpha",
            "2012",
        ):
            if marker not in text:
                errors.append(f"{relative}: identity marker is missing {marker!r}")
    elif relative == "newsletter.html":
        for marker in (
            "Galileo Newsletter",
            'href="/newsletter/the-browser-project/"',
            "Read the founding note",
            'id="newsletter-updates-title"',
            "<!-- newsletter-discussion-posts -->",
            "26 July 2026",
            "The browser project",
            "appear here automatically",
        ):
            if marker not in text:
                errors.append(f"{relative}: newsletter marker is missing {marker!r}")
    elif relative == "newsletter/the-browser-project/index.html":
        for marker in (
            "The browser project",
            "26 July 2026",
            "Loren Bufanu",
            "Servo was.",
            "Ladybird",
            "Draghi report",
            "Manifest V2",
            "assets/servo-ai-policy.png",
            "Let's finish the browser.",
            "AI-assisted contributions",
        ):
            if marker not in text:
                errors.append(f"{relative}: identity marker is missing {marker!r}")
    elif relative == "galileo-browser.html":
        for marker in (
            "Desktop browser / in development",
            "In development",
            "No public release",
            "Manifest V2",
            "uBlock Origin",
            "assets/ublock-origin-icon.png",
            "device-to-device",
            "Mozilla Research",
        ):
            if marker not in text:
                errors.append(f"{relative}: product boundary is missing {marker!r}")
    elif relative == "roadmap.html":
        for marker in (
            "A browser moves through gates.",
            "26 July 2026",
            "initial standalone import",
            "Verified lineage:",
            "5,099 commits follow the import",
            "source-history count, not a quality score",
            "Inspect the lineage record",
            "Cloudflare Turnstile",
            "official dummy-key canary",
            "3/3 headless and 3/3 headed",
            "Retained revalidation:",
            "127/127 expected results",
            "local cross-origin click-delivery probe",
            "production acceptance remains Cloudflare's decision",
            "YouTube, working",
            "clean-profile, no-WebDriver journey",
            "completed 5/5 seeks",
            "Second retained run:",
            "3/3 seeks",
            "4.056-second freeze",
            "bounded playback",
            "Source progress through 30 August:",
            "no newer comparable sustained YouTube run was retained",
            "Baseline and product shell",
            "Security foundation",
            "Extensions and ecosystem",
            "Engineering pre-alpha package",
            "Public pre-alpha",
            "Alpha and release qualification",
            "5,099",
            "1,021",
            "3,598",
            "82 extension manifests",
            "286 / 286 selected subtests",
            "Security qualification",
            "Performance baseline",
            "54 / 68 observed partial",
            "67 / 68 declared scopes touched",
            "No formal state was promoted.",
            "feature-inventory-series.json",
            "10 focused Rust checks",
            "17 WPT files",
            "Five implementation paths improved",
            "Last comparable run · 13 Aug",
            "Source progress through 30 Aug",
            "current reviewed head",
            "Progress after the snapshot",
            "Next proof",
            "One month. Seven verified checkpoints.",
            "Galileo only",
            "Source reviewed through 30 Aug 2026",
            "7 evidence checkpoints",
            "Line graph showing seven evidence-backed Galileo checkpoints",
            "Chronology",
            "not a completion score",
            "Inspect the complete checkpoint data",
            "galileo-project-timeline.json",
            "Progress since then:",
            "preservesPitch",
            "next · gates open",
            "Useful progress. Clear open gates.",
            "The code moved. The gates remain.",
            "The architecture is already much larger.",
            "Code exists. Qualification still has to catch up.",
            'id="current-status"',
        ):
            if marker not in text:
                errors.append(f"{relative}: evidence boundary is missing {marker!r}")
        for stale_marker in (
            "Line graph comparing Servo",
            '<th scope="col">Servo</th>',
            "Servo and GalileoEngine Phase 0 Core history",
        ):
            if stale_marker in text:
                errors.append(f"{relative}: Galileo-only graph still contains {stale_marker!r}")
    elif relative == "about.html":
        for marker in (
            "We wanted to build differently.",
            "The route from a shared foundation to our own project.",
            "Servo",
            "Galileo Engine",
            "Galileo Browser",
            "Servo drew a clear line around AI-generated contributions.",
            "We chose to continue independently.",
            "AI can carry volume. People still own the engineering.",
            "https://book.servo.org/contributing/getting-started#ai-contributions",
            "Three co-founders. Shared responsibility.",
            "Loren Bufanu",
            "Ionel Silviu Ghimpau",
            "Manuel Ionasel",
            "loren@galileobrowser.com",
            "silviu@galileobrowser.com",
            "manuel@galileobrowser.com",
            "contact@galileobrowser.com",
            'id="team"',
            'id="contact"',
            "The next goal is a genuinely usable alpha.",
        ):
            if marker not in text:
                errors.append(f"{relative}: About Galileo marker is missing {marker!r}")
        for card_marker in ('class="founder-card"', 'class="contact-card"', 'class="callout'):
            if card_marker in text:
                errors.append(f"{relative}: editorial About page still contains card UI {card_marker!r}")
    elif relative == "get-involved.html":
        for marker in (
            "There is more than one way to move a browser forward.",
            "Contribute where the work is public.",
            "Open the Newsletter",
            "We are not accepting money yet",
            "GitHub Sponsors",
            "A browser costs more than code.",
        ):
            if marker not in text:
                errors.append(f"{relative}: involvement boundary is missing {marker!r}")
    elif relative == "contributing.html":
        for marker in (
            "Make one change. Show why it works.",
            "Start where the work is visible.",
            "Leave a trail another engineer can follow.",
            "If AI assisted the work",
            "Browse the repositories",
            "Read project updates",
        ):
            if marker not in text:
                errors.append(f"{relative}: contribution guidance is missing {marker!r}")
    if relative == "platform.html" and 'href="/platform/" aria-current="page">Galileo Engine' not in text:
        errors.append(f"{relative}: Engine must be the current navigation item")
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
        if '<noscript><meta http-equiv="refresh"' not in text:
            errors.append(f"{relative}: meta refresh must remain a no-JavaScript fallback")
        if f'href="{destination}"' not in text:
            errors.append(f"{relative}: canonical or fallback link to {destination} is missing")
        if 'name="robots" content="noindex"' not in text:
            errors.append(f"{relative}: redirect must be excluded from indexing")
        for marker in (
            "target.search = window.location.search",
            "target.hash = window.location.hash",
            "window.location.replace(target)",
        ):
            if marker not in text:
                errors.append(f"{relative}: redirect must preserve query strings and fragments")
        if parser.tags["h1"] != 1:
            errors.append(f"{relative}: redirect must contain one fallback heading")
        for tag, value, _attrs in parser.attrs:
            if tag in {"a", "img", "link"}:
                issue = check_local_reference(path, value)
                if issue:
                    errors.append(f"{relative}: {issue}")
    return errors


def validate_built_routes() -> list[str]:
    errors: list[str] = []
    output_root = ROOT / "dist"
    if not output_root.is_dir():
        return ["dist: generated site is missing; run the build before validation"]
    if (output_root / "assets" / "human-ai-handoff.png").exists():
        errors.append("dist/assets/human-ai-handoff.png: unused illustration must not be published")
    if (output_root / "assets" / "ai-acceleration.png").exists():
        errors.append("dist/assets/ai-acceleration.png: replaced illustration must not be published")

    for source, route in LEGACY_CLEAN_PAGES.items():
        clean_page = output_root / route.strip("/") / "index.html"
        if not clean_page.is_file():
            errors.append(f"dist{route}: clean route entry file is missing")
        else:
            built_text = clean_page.read_text(encoding="utf-8")
            source_text = (ROOT / source).read_text(encoding="utf-8")
            if source == "newsletter.html":
                if "<!-- newsletter-discussion-posts -->" in built_text:
                    errors.append("dist/newsletter/: discussion placeholder was not rendered")
                if "The browser project" not in built_text or "journal-entry--discussion" not in built_text:
                    errors.append("dist/newsletter/: static and discussion-backed entries were not both rendered")
            elif built_text != source_text:
                errors.append(f"dist{route}: generated page differs from {source}")

        legacy_page = output_root / source
        if not legacy_page.is_file():
            errors.append(f"dist/{source}: legacy compatibility page is missing")
            continue
        legacy_text = legacy_page.read_text(encoding="utf-8")
        canonical = f"https://galileobrowser.com{route}"
        for marker in (
            'name="robots" content="noindex"',
            '<noscript><meta http-equiv="refresh"',
            f'content="0; url={route}"',
            f'<link rel="canonical" href="{canonical}">',
            f'<a href="{route}">',
            "target.search = window.location.search",
            "target.hash = window.location.hash",
            "window.location.replace(target)",
        ):
            if marker not in legacy_text:
                errors.append(f"dist/{source}: compatibility redirect is missing {marker!r}")

    for route, destination in ROUTE_REDIRECTS.items():
        canonical = destination if urlparse(destination).scheme else f"https://galileobrowser.com{destination}"
        for relative in (f"{route}/index.html", f"{route}.html"):
            redirect_path = output_root / relative
            if not redirect_path.is_file():
                errors.append(f"dist/{relative}: retired route redirect is missing")
                continue
            redirect_text = redirect_path.read_text(encoding="utf-8")
            for marker in (
                'name="robots" content="noindex"',
                '<noscript><meta http-equiv="refresh"',
                f'content="0; url={destination}"',
                f'<link rel="canonical" href="{canonical}">',
                f'<a href="{destination}">',
                "target.search = window.location.search",
                "target.hash = window.location.hash",
                "window.location.replace(target)",
            ):
                if marker not in redirect_text:
                    errors.append(f"dist/{relative}: retired route redirect is missing {marker!r}")

    snapshot = load_newsletter_snapshot()
    discussions = snapshot.get("discussions", []) if isinstance(snapshot, dict) else []
    discussion_numbers = {
        discussion["number"]
        for discussion in discussions
        if isinstance(discussion, dict) and isinstance(discussion.get("number"), int) and discussion["number"] > 0
    }
    for number in sorted(discussion_numbers):
        slug = NEWSLETTER_POST_SLUGS.get(number, f"update-{number}")
        relative = f"newsletter/{slug}/index.html"
        page_path = output_root / relative
        if not page_path.is_file():
            errors.append(f"dist/{relative}: generated newsletter post is missing")
            continue
        text, parser = parse_page(page_path)
        for landmark in ("header", "main", "nav", "h1", "footer"):
            if parser.tags[landmark] != 1:
                errors.append(f"dist/{relative}: expected exactly one <{landmark}>")
        if "Open comments on GitHub" not in text:
            errors.append(f"dist/{relative}: newsletter comments are missing the GitHub fallback link")
        if "Galileo Journal" in text:
            errors.append(f"dist/{relative}: retired Journal wording remains in the public newsletter post")
        for marker in ('data-nav-group', 'href="/contributing/"', 'class="site-nav__link" href="/newsletter/"'):
            if marker not in text:
                errors.append(f"dist/{relative}: grouped navigation is missing {marker!r}")

        if 'data-comments-provider="giscus"' in text:
            for marker in (
                "https://giscus.app/client.js",
                'data-mapping="number"',
                f'data-term="{number}"',
            ):
                if marker not in text:
                    errors.append(f"dist/{relative}: giscus integration is missing {marker!r}")
        elif 'data-comments-provider="github-link"' in text:
            if "Read the replies or add your own" not in text:
                errors.append(f"dist/{relative}: GitHub discussion fallback copy is missing")
        else:
            errors.append(f"dist/{relative}: discussion integration has no supported comments provider")

        legacy_relative = f"newsletter/discussions/{number}/index.html"
        legacy_path = output_root / legacy_relative
        if not legacy_path.is_file():
            errors.append(f"dist/{legacy_relative}: legacy newsletter route is missing")
        else:
            legacy_text = legacy_path.read_text(encoding="utf-8")
            public_route = f"/newsletter/{slug}/"
            for marker in (
                'name="robots" content="noindex"',
                f'content="0; url={public_route}"',
                f'<a href="{public_route}">',
                "window.location.replace(target)",
            ):
                if marker not in legacy_text:
                    errors.append(f"dist/{legacy_relative}: legacy newsletter redirect is missing {marker!r}")

    sitemap_path = output_root / "sitemap.xml"
    if not sitemap_path.is_file():
        return errors + ["dist/sitemap.xml: generated sitemap is missing"]
    sitemap = sitemap_path.read_text(encoding="utf-8")
    if ".html</loc>" in sitemap:
        errors.append("dist/sitemap.xml: legacy .html URLs must not be indexed")
    for route in CLEAN_ROUTES.values():
        if route == "/404.html":
            continue
        if f"https://galileobrowser.com{route}</loc>" not in sitemap:
            errors.append(f"dist/sitemap.xml: clean route is missing {route}")
    for route in ROUTE_REDIRECTS:
        if f"https://galileobrowser.com/{route}/</loc>" in sitemap:
            errors.append(f"dist/sitemap.xml: retired route must not be indexed /{route}/")
    for number in sorted(discussion_numbers):
        slug = NEWSLETTER_POST_SLUGS.get(number, f"update-{number}")
        public_route = f"/newsletter/{slug}/"
        if f"https://galileobrowser.com{public_route}</loc>" not in sitemap:
            errors.append(f"dist/sitemap.xml: newsletter route is missing {public_route}")
        if f"https://galileobrowser.com/newsletter/discussions/{number}/</loc>" in sitemap:
            errors.append(f"dist/sitemap.xml: legacy discussion route must not be indexed for post {number}")
    return errors


def validate_route_and_theme_runtime() -> list[str]:
    errors: list[str] = []
    script = (ROOT / "site.js").read_text(encoding="utf-8")
    for source, route in LEGACY_CLEAN_PAGES.items():
        source_path = f"/{source}"
        if f'"{source_path}": "{route}"' not in script:
            errors.append(f"site.js: cached legacy route recovery is missing {source_path} -> {route}")
    for route, destination in ROUTE_REDIRECTS.items():
        source_path = f"/{route}.html"
        if f'"{source_path}": "{destination}"' not in script:
            errors.append(f"site.js: retired route recovery is missing {source_path} -> {destination}")
    for marker in (
        "target.search = window.location.search",
        "target.hash = window.location.hash",
        "window.location.replace(target)",
        "setNavGroupOpen",
        "data-nav-group",
        'event.key !== "ArrowDown"',
        "syncGiscusTheme",
        'theme === "dark" ? "dark_dimmed" : "light"',
        "stabilizeHashTarget",
        "document.fonts.ready",
        'scrollIntoView({ block: "start" })',
        "window.setTimeout(alignTarget, 1200)",
    ):
        if marker not in script:
            errors.append(f"site.js: route normalization is missing {marker!r}")

    workflow = (ROOT / ".github/workflows/pages.yml").read_text(encoding="utf-8")
    for marker in ("discussion:", "types: [created, edited, deleted, category_changed]", "discussions: read", "GISCUS_ENABLED"):
        if marker not in workflow:
            errors.append(f"pages workflow: discussion publishing is missing {marker!r}")

    build_script = (ROOT / "scripts/build-pages.mjs").read_text(encoding="utf-8")
    for marker in ("NewsletterDiscussions", "newsletter-discussions.json", "renderDiscussionPage", "publicDiscussionRoute", "giscus.app/client.js"):
        if marker not in build_script:
            errors.append(f"build-pages.mjs: newsletter publishing is missing {marker!r}")

    styles = (ROOT / "galileo.css").read_text(encoding="utf-8")
    for marker in ("prefers-reduced-motion: reduce", "animation-duration: .01ms", "scroll-behavior: auto"):
        if marker not in styles:
            errors.append(f"galileo.css: reduced-motion support is missing {marker!r}")

    return errors


def validate_progress_snapshot() -> list[str]:
    errors: list[str] = []
    relative = "data/progress/2026-W33.json"
    path = ROOT / relative
    if not path.is_file():
        return [f"{relative}: required progress snapshot is missing"]

    try:
        snapshot = json.loads(path.read_text(encoding="utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        return [f"{relative}: invalid UTF-8 JSON: {exc}"]

    features = snapshot.get("features", {})
    states = features.get("states", {})
    denominator = features.get("denominator")
    if not isinstance(denominator, int) or denominator <= 0:
        errors.append(f"{relative}: feature denominator must be a positive integer")
    if not isinstance(states, dict) or not states or any(not isinstance(value, int) or value < 0 for value in states.values()):
        errors.append(f"{relative}: feature states must be non-negative integer counts")
    elif sum(states.values()) != denominator:
        errors.append(f"{relative}: feature state counts do not equal the denominator")

    wpt = snapshot.get("wpt", {})
    servo_comparator = wpt.get("servo_comparator", {})
    if not isinstance(servo_comparator, dict):
        servo_comparator = {}
    servo_subtests = servo_comparator.get("subtests", {})
    if servo_comparator.get("github_actions_run") != 31788413088:
        errors.append(f"{relative}: Servo comparator must identify the reviewed public workflow run")
    if servo_subtests.get("applicable") != 286 or servo_subtests.get("passed") != 246 or servo_subtests.get("failed") != 40:
        errors.append(f"{relative}: Servo comparator counts must preserve the extracted 286-subtest denominator")
    comparison_checks = wpt.get("comparison_checks", {})
    if comparison_checks.get("test_identifiers_identical") is not True or comparison_checks.get("subtest_names_identical") is not True:
        errors.append(f"{relative}: same-denominator comparison checks are missing")
    if comparison_checks.get("same_execution_environment") is not False:
        errors.append(f"{relative}: execution-environment boundary must remain explicit")
    if "not a web-compatibility score" not in wpt.get("interpretation", ""):
        errors.append(f"{relative}: WPT scope limitation is missing")

    evidence_relative = wpt.get("evidence_file")
    evidence_path = ROOT / evidence_relative if isinstance(evidence_relative, str) else None
    if evidence_path is None or not evidence_path.is_file():
        errors.append(f"{relative}: extracted WPT comparison evidence is missing")
    else:
        try:
            evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            errors.append(f"{evidence_relative}: invalid UTF-8 JSON: {exc}")
        else:
            scope = evidence.get("scope", {})
            galileo_result = evidence.get("galileo", {}).get("result", {})
            servo_result = evidence.get("servo", {}).get("result", {})
            artifact = evidence.get("servo", {}).get("artifact", {})
            if scope.get("subtests") != 286 or scope.get("subtest_names_identical") is not True:
                errors.append(f"{evidence_relative}: exact shared denominator is missing")
            if galileo_result.get("passed") != 286 or galileo_result.get("failed") != 0:
                errors.append(f"{evidence_relative}: Galileo retained-result counts are inconsistent")
            if servo_result.get("passed") != 246 or servo_result.get("failed") != 40:
                errors.append(f"{evidence_relative}: Servo extracted-result counts are inconsistent")
            if artifact.get("digest") != "sha256:94809630557e4f2f3bd2ff86d73fd411f349b947819e6258a534f2b0aa5ab1c7":
                errors.append(f"{evidence_relative}: official Servo artifact digest is missing")

    fork_relative = wpt.get("fork_baseline_file")
    fork_path = ROOT / fork_relative if isinstance(fork_relative, str) else None
    if fork_path is None or not fork_path.is_file():
        errors.append(f"{relative}: fork baseline evidence is missing")
    else:
        try:
            fork_evidence = json.loads(fork_path.read_text(encoding="utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            errors.append(f"{fork_relative}: invalid UTF-8 JSON: {exc}")
        else:
            fork_scope = fork_evidence.get("scope", {})
            fork_servo = fork_evidence.get("servo", {})
            fork_galileo = fork_evidence.get("galileo_origin", {})
            fork_artifact = fork_servo.get("artifact", {})
            if fork_scope.get("subtests") != 286 or fork_scope.get("subtest_names_match_2026_W33") is not True:
                errors.append(f"{fork_relative}: fork baseline does not preserve the shared 286-subtest denominator")
            if fork_servo.get("source_commit") != "93d8f85503e0f0ef29115827dc1023174aeeaff1":
                errors.append(f"{fork_relative}: fork baseline does not identify the verified merge base")
            if fork_servo.get("result", {}).get("passed") != 246 or fork_servo.get("result", {}).get("failed") != 40:
                errors.append(f"{fork_relative}: extracted Servo fork counts are inconsistent")
            if fork_galileo.get("measurement_kind") != "inherited-identical-source-baseline":
                errors.append(f"{fork_relative}: Galileo origin must be labelled as an inherited baseline")
            if fork_galileo.get("result") != fork_servo.get("result"):
                errors.append(f"{fork_relative}: Galileo origin must preserve the identical-source Servo result")
            if fork_artifact.get("digest") != "sha256:528b1ff356af038d312126938f150810524b66ea59d106b74eac4774334c9d52":
                errors.append(f"{fork_relative}: official Servo fork artifact digest is missing")

    series_relative = wpt.get("series_file")
    series_path = ROOT / series_relative if isinstance(series_relative, str) else None
    if series_path is None or not series_path.is_file():
        errors.append(f"{relative}: Phase 0 history series is missing")
    else:
        try:
            series = json.loads(series_path.read_text(encoding="utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            errors.append(f"{series_relative}: invalid UTF-8 JSON: {exc}")
        else:
            metric = series.get("metric", {})
            points = series.get("points", [])
            if metric.get("denominator") != 286 or metric.get("axis_min") != 0 or metric.get("axis_max") != 286:
                errors.append(f"{series_relative}: the graph must use an honest zero-to-286 scale")
            if not isinstance(points, list) or len(points) < 2:
                errors.append(f"{series_relative}: at least two verified checkpoints are required")
            else:
                periods = [point.get("period") for point in points]
                if periods != sorted(periods) or len(periods) != len(set(periods)):
                    errors.append(f"{series_relative}: checkpoints must be unique and ordered")
                first, latest = points[0], points[-1]
                if first.get("galileo", {}).get("passed") != 246:
                    errors.append(f"{series_relative}: Galileo starting checkpoint must remain 246")
                if first.get("galileo", {}).get("measurement_kind") != "inherited-identical-source-baseline":
                    errors.append(f"{series_relative}: first Galileo point must remain visibly inherited")
                if first.get("galileo", {}).get("independent_execution") is not False:
                    errors.append(f"{series_relative}: Galileo starting checkpoint must not claim an independent execution")
                if latest.get("galileo", {}).get("passed") != 286:
                    errors.append(f"{series_relative}: latest verified Galileo checkpoint is inconsistent")
                if latest.get("galileo", {}).get("independent_execution") is not True:
                    errors.append(f"{series_relative}: latest point must identify the separate Galileo run")
                for point in points:
                    value = point.get("galileo", {}).get("passed")
                    if not isinstance(value, int) or not 0 <= value <= 286:
                        errors.append(f"{series_relative}: Galileo value is outside the denominator")
            boundary = series.get("measurement_boundary", {})
            if boundary.get("test_identifiers_identical_across_points") is not True or boundary.get("subtest_names_identical_across_points") is not True:
                errors.append(f"{series_relative}: shared test identity checks are missing")
            if "narrow compatibility shard" not in boundary.get("interpretation", ""):
                errors.append(f"{series_relative}: Galileo-only scope limitation is missing")
            if series.get("operation", {}).get("weekly_automation_active") is not False:
                errors.append(f"{series_relative}: weekly automation must not be claimed before it exists")

    upstream = snapshot.get("upstream", {})
    if upstream.get("current_integrated_base", "missing") is not None:
        errors.append(f"{relative}: current integrated base must remain null until recorded")
    if "not a GalileoEngine behind count" not in upstream.get("interpretation", ""):
        errors.append(f"{relative}: upstream interpretation boundary is missing")

    timeline_relative = "data/evidence/galileo-project-timeline.json"
    timeline_path = ROOT / timeline_relative
    if not timeline_path.is_file():
        errors.append(f"{timeline_relative}: current Galileo timeline is missing")
    else:
        try:
            timeline = json.loads(timeline_path.read_text(encoding="utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            errors.append(f"{timeline_relative}: invalid UTF-8 JSON: {exc}")
        else:
            points = timeline.get("points", [])
            if timeline.get("kind") != "galileo-project-evolution":
                errors.append(f"{timeline_relative}: unexpected timeline kind")
            if timeline.get("reviewed_through") != "2026-08-30":
                errors.append(f"{timeline_relative}: reviewed-through date is not current")
            if timeline.get("source_head") != "99af1539f3403f163a225d24130ee8176cba337f":
                errors.append(f"{timeline_relative}: current reviewed source head is missing")
            if not isinstance(points, list) or len(points) != 7:
                errors.append(f"{timeline_relative}: seven selected checkpoints are required")
            else:
                dates = [point.get("date") for point in points]
                sequences = [point.get("sequence") for point in points]
                if dates != sorted(dates) or len(dates) != len(set(dates)):
                    errors.append(f"{timeline_relative}: checkpoint dates must be unique and ordered")
                if sequences != list(range(1, len(points) + 1)):
                    errors.append(f"{timeline_relative}: checkpoint sequence must be contiguous")
                if dates[0] != "2026-07-26" or dates[-1] != "2026-08-30":
                    errors.append(f"{timeline_relative}: timeline must span the standalone import through the current reviewed head")
                expected_commits = {
                    "525533a36279",
                    "850482f99863",
                    "d0e89798d992",
                    "860361519dd6",
                    "2fe12e0e8f82",
                    "3fe5fc70fd6d",
                    "99af1539f340",
                }
                if {point.get("commit") for point in points} != expected_commits:
                    errors.append(f"{timeline_relative}: checkpoint commit set is incomplete")
            scale = timeline.get("scale", {})
            if scale.get("y") != "ordered evidence checkpoints" or "not a completion percentage" not in scale.get("interpretation", ""):
                errors.append(f"{timeline_relative}: the non-score chart boundary is missing")

    lineage = snapshot.get("lineage", {})
    if lineage.get("merge_base") != upstream.get("declared_initial_base"):
        errors.append(f"{relative}: verified merge base must match the declared initial base")
    if lineage.get("commits_from_base_to_verified_checkpoint") != 8:
        errors.append(f"{relative}: verified Galileo checkpoint distance must remain explicit")
    if lineage.get("current_hosted_history_linkage") != "not-exposed-after-repository-migration":
        errors.append(f"{relative}: hosted-history migration boundary is missing")
    if "Git ancestry verified" not in lineage.get("solid_line_meaning", ""):
        errors.append(f"{relative}: solid lineage interpretation is missing")
    if "Project continuation after migration" not in lineage.get("dashed_line_meaning", ""):
        errors.append(f"{relative}: dashed lineage interpretation is missing")

    if snapshot.get("review_status") != "manual-reviewed":
        errors.append(f"{relative}: snapshot must identify its review status")
    return errors


def validate_newsletter_snapshot() -> list[str]:
    relative = "data/newsletter-discussions.json"
    snapshot = load_newsletter_snapshot()
    if not snapshot:
        return [f"{relative}: invalid or unreadable JSON"]

    source = snapshot.get("source", {})
    if source.get("repository") != "GalileoBrowser/galileoengine-site-v2":
        return [f"{relative}: public website repository is not the newsletter source"]
    if source.get("category") != "Announcements":
        return [f"{relative}: Announcements must be the newsletter category"]

    discussions = snapshot.get("discussions")
    if not isinstance(discussions, list) or not discussions:
        return [f"{relative}: at least one cached announcement is required for local preview"]

    errors: list[str] = []
    seen: set[int] = set()
    for item in discussions:
        if not isinstance(item, dict):
            errors.append(f"{relative}: discussion entries must be objects")
            continue
        number = item.get("number")
        if not isinstance(number, int) or number < 1 or number in seen:
            errors.append(f"{relative}: discussion number must be unique and positive")
            continue
        seen.add(number)
        if not str(item.get("url", "")).startswith("https://github.com/GalileoBrowser/galileoengine-site-v2/discussions/"):
            errors.append(f"{relative}: discussion #{number} has an unexpected source URL")
        for field in ("title", "createdAt", "bodyHtml", "bodyText"):
            if not isinstance(item.get(field), str) or not item[field].strip():
                errors.append(f"{relative}: discussion #{number} is missing {field}")
    return errors


def validate_files() -> list[str]:
    errors = validate_brand_cleanup()
    for relative in REQUIRED_ASSETS:
        if not (ROOT / relative).is_file():
            errors.append(f"{relative}: required asset is missing")
    for relative in PUBLIC_PAGES:
        errors.extend(validate_public_page(relative))
    errors.extend(validate_redirects())
    errors.extend(validate_built_routes())
    errors.extend(validate_route_and_theme_runtime())
    errors.extend(validate_progress_snapshot())
    errors.extend(validate_newsletter_snapshot())
    return errors


def fetch(url: str) -> tuple[int, str, int]:
    request = urllib.request.Request(url, headers={"User-Agent": "GalileoEngine-site-validator/1.0"})
    with urllib.request.urlopen(request, timeout=10) as response:
        return response.status, response.headers.get_content_type(), len(response.read())


def smoke_http(base_url: str) -> list[str]:
    errors: list[str] = []
    snapshot = load_newsletter_snapshot()
    discussions = snapshot.get("discussions", []) if isinstance(snapshot, dict) else []
    discussion_numbers = {
        discussion["number"]
        for discussion in discussions
        if isinstance(discussion, dict) and isinstance(discussion.get("number"), int) and discussion["number"] > 0
    }
    discussion_root = ROOT / "dist" / "newsletter" / "discussions"
    if discussion_root.is_dir():
        for candidate in discussion_root.glob("*/index.html"):
            try:
                discussion_numbers.add(int(candidate.parent.name))
            except ValueError:
                pass
    expected = {
        **{
            CANONICAL_ROUTES[page].lstrip("/"): "text/html"
            for page in PUBLIC_PAGES
        },
        **{page: "text/html" for page in REDIRECT_PAGES},
        **{page: "text/html" for page in LEGACY_CLEAN_PAGES},
        "galileo.css": "text/css",
        "site.js": ("application/javascript", "text/javascript"),
        "evidence-chart.js": ("application/javascript", "text/javascript"),
        "assets/galileo-symbol.png": "image/png",
        "assets/relay-handoff.png": "image/png",
        "assets/servo-ai-policy.png": "image/png",
        "team-loren.png": "image/png",
        "team-manuel.png": "image/png",
        "team-silviu.png": "image/png",
        "robots.txt": "text/plain",
        "sitemap.xml": ("application/xml", "text/xml"),
        "data/progress/2026-W33.json": "application/json",
        "data/evidence/2026-W30-phase0-core-fork-base.json": "application/json",
        "data/evidence/2026-W33-phase0-core-comparison.json": "application/json",
        "data/evidence/phase0-core-series.json": "application/json",
        "data/evidence/feature-inventory-series.json": "application/json",
        "data/evidence/galileo-project-timeline.json": "application/json",
        "data/galileo-audit.json": "application/json",
        "data/newsletter-discussions.json": "application/json",
        **{
            f"newsletter/{NEWSLETTER_POST_SLUGS.get(number, f'update-{number}')}/": "text/html"
            for number in discussion_numbers
        },
        **{
            f"newsletter/discussions/{number}/": "text/html"
            for number in discussion_numbers
        },
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
    redirect_count = len(REDIRECT_PAGES) + len(LEGACY_CLEAN_PAGES)
    snapshot = load_newsletter_snapshot()
    generated_numbers = {
        discussion["number"]
        for discussion in snapshot.get("discussions", [])
        if isinstance(snapshot, dict)
        and isinstance(discussion, dict)
        and isinstance(discussion.get("number"), int)
    }
    generated_posts = len(generated_numbers)
    print(f"PASS: {len(PUBLIC_PAGES)} public pages, {generated_posts} discussion post(s), and {redirect_count} compatibility redirects passed {mode}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
