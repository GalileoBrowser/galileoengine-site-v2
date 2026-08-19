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
    "status.html",
    "team.html",
    "support.html",
    "contact.html",
    "journal/index.html",
    "404.html",
)
CLEAN_ROUTES = {
    "index.html": "/",
    "platform.html": "/platform/",
    "roadmap.html": "/roadmap/",
    "galileo-browser.html": "/galileo-browser/",
    "status.html": "/status/",
    "team.html": "/team/",
    "support.html": "/support/",
    "contact.html": "/contact/",
    "journal/index.html": "/journal/",
    "404.html": "/404.html",
}
LEGACY_CLEAN_PAGES = {
    page: route
    for page, route in CLEAN_ROUTES.items()
    if page not in {"index.html", "journal/index.html", "404.html"}
}
REDIRECT_PAGES = {
    "Home.dc.html": "/",
    "About.dc.html": "/platform/",
    "Build.dc.html": "/platform/",
    "Goals.dc.html": "/roadmap/",
    "Contribute.dc.html": "/roadmap/",
    "Status.dc.html": "/status/",
    "Team.dc.html": "/team/",
    "products.html": "/galileo-browser/",
}
REQUIRED_ASSETS = (
    "galileo.css",
    "site.js",
    "evidence-chart.js",
    "assets/galileo-symbol.png",
    "assets/ai-acceleration.png",
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
    "data/galileo-audit.json",
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
        if tag == "button" and not attrs.get("type"):
            errors.append(f"{relative}: button is missing an explicit type")
        if tag == "script" and attrs.get("src") and "defer" not in attrs:
            errors.append(f"{relative}: external script is not deferred")

    if text.count('aria-current="page"') > 1:
        errors.append(f"{relative}: more than one current-page marker")
    if 'href="/team/"' not in text:
        errors.append(f"{relative}: Team navigation link is missing")
    if '<a class="nav-support" href="/support/"' not in text or "About</a>" not in text:
        errors.append(f"{relative}: About navigation link is missing or mislabeled")
    if 'href="/roadmap/"' not in text or "Roadmap</a>" not in text:
        errors.append(f"{relative}: Roadmap navigation link is missing or mislabeled")
    if 'href="/journal/"' not in text or "Newsletter</a>" not in text:
        errors.append(f"{relative}: Newsletter navigation link is missing or mislabeled")
    if "family=Manrope" not in text:
        errors.append(f"{relative}: Manrope font request is missing")
    if 'href="/galileo.css?' not in text or 'src="/site.js?' not in text:
        errors.append(f"{relative}: versioned public CSS or JavaScript reference is missing")
    if 'meta http-equiv="refresh"' in text.lower():
        errors.append(f"{relative}: public page must not use a meta refresh")
    if 'name="theme-color"' not in text:
        errors.append(f"{relative}: theme color metadata is missing")
    if relative != "404.html":
        expected_url = "https://galileobrowser.com" + CLEAN_ROUTES[relative]
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
            "assets/servo-ai-policy.png",
            "26 Jul 2026",
            "Mozilla Research starts Servo",
            "in months, not years",
            "2012",
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
            "A browser is a sequence of milestones.",
            "26 July 2026",
            "Cloudflare Turnstile",
            "YouTube, working",
            "Extensions",
            "Pre-alpha release",
            "Google and Facebook login",
            "Alpha release",
            "Release candidate 1",
            "compatibility first, then security, then speed",
            "months, not years",
        ):
            if marker not in text:
                errors.append(f"{relative}: evidence boundary is missing {marker!r}")
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
        for marker in (
            "Contribute code",
            "We are not accepting money yet",
            "GitHub Sponsors is pending",
            "AI is fast. It is not free.",
            "tokens cost money",
        ):
            if marker not in text:
                errors.append(f"{relative}: support boundary is missing {marker!r}")
    elif relative == "contact.html":
        for marker in (
            "contact@galileobrowser.com",
            "loren@galileobrowser.com",
            "silviu@galileobrowser.com",
            "manuel@galileobrowser.com",
            "github.com/GalileoBrowser/GalileoEngine",
            "github.com/GalileoBrowser/GalileoExtensions",
            "galileoengine-site-v2",
            "Where to say what",
        ):
            if marker not in text:
                errors.append(f"{relative}: contact page is missing {marker!r}")
    elif relative == "journal/index.html":
        for marker in (
            "GitHub Discussions",
            "JOURNAL_ENTRIES_START",
            "github.com/GalileoBrowser/galileoengine-site-v2/discussions/categories/announcements",
            "github.com/GalileoBrowser/GalileoEngine/discussions",
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

    for source, route in LEGACY_CLEAN_PAGES.items():
        clean_page = output_root / route.strip("/") / "index.html"
        if not clean_page.is_file():
            errors.append(f"dist{route}: clean route entry file is missing")
        elif clean_page.read_text(encoding="utf-8") != (ROOT / source).read_text(encoding="utf-8"):
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
    return errors


def validate_route_and_theme_runtime() -> list[str]:
    errors: list[str] = []
    script = (ROOT / "site.js").read_text(encoding="utf-8")
    for source, route in LEGACY_CLEAN_PAGES.items():
        source_path = f"/{source}"
        if f'"{source_path}": "{route}"' not in script:
            errors.append(f"site.js: cached legacy route recovery is missing {source_path} -> {route}")
    for marker in (
        "target.search = window.location.search",
        "target.hash = window.location.hash",
        "window.location.replace(target)",
    ):
        if marker not in script:
            errors.append(f"site.js: route normalization is missing {marker!r}")

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
                if (first.get("servo", {}).get("passed"), first.get("galileo", {}).get("passed")) != (246, 246):
                    errors.append(f"{series_relative}: fork checkpoint must start both lines at 246")
                if first.get("galileo", {}).get("measurement_kind") != "inherited-identical-source-baseline":
                    errors.append(f"{series_relative}: first Galileo point must remain visibly inherited")
                if (latest.get("servo", {}).get("passed"), latest.get("galileo", {}).get("passed")) != (246, 286):
                    errors.append(f"{series_relative}: latest verified checkpoint is inconsistent")
                for point in points:
                    for project in ("servo", "galileo"):
                        value = point.get(project, {}).get("passed")
                        if not isinstance(value, int) or not 0 <= value <= 286:
                            errors.append(f"{series_relative}: {project} value is outside the denominator")
            boundary = series.get("comparison_boundary", {})
            if boundary.get("test_identifiers_identical_across_points") is not True or boundary.get("subtest_names_identical_across_points") is not True:
                errors.append(f"{series_relative}: shared test identity checks are missing")
            if boundary.get("current_execution_environment_identical") is not False:
                errors.append(f"{series_relative}: current environment difference must remain explicit")
            if series.get("operation", {}).get("weekly_automation_active") is not False:
                errors.append(f"{series_relative}: weekly automation must not be claimed before it exists")

    upstream = snapshot.get("upstream", {})
    if upstream.get("current_integrated_base", "missing") is not None:
        errors.append(f"{relative}: current integrated base must remain null until recorded")
    if "not a GalileoEngine behind count" not in upstream.get("interpretation", ""):
        errors.append(f"{relative}: upstream interpretation boundary is missing")

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
    return errors


def fetch(url: str) -> tuple[int, str, int]:
    request = urllib.request.Request(url, headers={"User-Agent": "GalileoEngine-site-validator/1.0"})
    with urllib.request.urlopen(request, timeout=10) as response:
        return response.status, response.headers.get_content_type(), len(response.read())


def smoke_http(base_url: str) -> list[str]:
    errors: list[str] = []
    expected = {
        **{
            CLEAN_ROUTES[page].lstrip("/"): "text/html"
            for page in PUBLIC_PAGES
        },
        **{page: "text/html" for page in REDIRECT_PAGES},
        **{page: "text/html" for page in LEGACY_CLEAN_PAGES},
        "galileo.css": "text/css",
        "site.js": ("application/javascript", "text/javascript"),
        "evidence-chart.js": ("application/javascript", "text/javascript"),
        "assets/galileo-symbol.png": "image/png",
        "assets/ai-acceleration.png": "image/png",
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
        "data/galileo-audit.json": "application/json",
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
    print(f"PASS: {len(PUBLIC_PAGES)} public pages and {redirect_count} compatibility redirects passed {mode}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
