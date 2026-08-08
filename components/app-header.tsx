"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";

const links = [
  { href: "/platform.html", label: "Engine" },
  { href: "/roadmap.html", label: "Progress" },
  { href: "/galileo-browser.html", label: "Galileo Browser" },
  { href: "/journal", label: "Journal" },
  { href: "/team.html", label: "Team" },
  { href: "/support.html", label: "Support", accent: true },
];

type Theme = "dark" | "light";
const themeKey = "galileo-color-theme";
const themeEvent = "galileo-theme-change";

function readTheme(): Theme {
  return window.localStorage.getItem(themeKey) === "dark" ? "dark" : "light";
}

function subscribeToTheme(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(themeEvent, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(themeEvent, callback);
  };
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "light" ? "#f4f8f5" : "#0d2b25");
  window.localStorage.setItem(themeKey, theme);
  window.dispatchEvent(new Event(themeEvent));
}

export function AppHeader() {
  const pathname = usePathname();
  return <HeaderContent key={pathname} pathname={pathname} />;
}

function HeaderContent({ pathname }: { pathname: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const theme = useSyncExternalStore(subscribeToTheme, readTheme, () => "light");

  function chooseTheme(nextTheme: Theme) {
    applyTheme(nextTheme);
  }

  return (
    <header className="app-header" data-menu-open={menuOpen}>
      <div className="app-header__inner">
        <Link className="app-brand" href="/" aria-label="GalileoEngine home">
          {/* The asset is served by the legacy compatibility layer. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/galileo-symbol.png" alt="" width="42" height="42" />
          <span>
            Galileo<strong>Engine</strong>
          </span>
        </Link>

        <nav className="app-nav" id="journal-navigation" aria-label="Primary navigation">
          {links.map((link) => {
            const current =
              link.href === "/journal"
                ? pathname.startsWith("/journal")
                : pathname === link.href;

            return (
              <Link
                href={link.href}
                key={link.href}
                className={link.accent ? "app-nav__support" : undefined}
                aria-current={current ? "page" : undefined}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <Link className="research-status" href="/status.html">
          <span aria-hidden="true" /> Research stage
        </Link>

        <div className="app-theme-switch" role="group" aria-label="Color theme">
          {(["light", "dark"] as const).map((choice) => (
            <button
              type="button"
              key={choice}
              aria-pressed={theme === choice}
              onClick={() => chooseTheme(choice)}
            >
              {choice === "dark" ? "Dark" : "Light"}
            </button>
          ))}
        </div>

        <button
          className="app-menu-toggle"
          type="button"
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          aria-controls="journal-navigation"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
