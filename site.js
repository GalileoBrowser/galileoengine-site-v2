(function () {
  "use strict";

  var THEME_STORAGE_KEY = "galileo-color-theme";
  var LEGACY_PAGE_ROUTES = {
    "/platform.html": "/platform/",
    "/roadmap.html": "/roadmap/",
    "/galileo-browser.html": "/galileo-browser/",
    "/status.html": "/status/",
    "/team.html": "/team/",
    "/support.html": "/support/",
    "/contact.html": "/contact/",
    "/newsletter.html": "/newsletter/",
  };

  function redirectLegacyPageRoute() {
    var destination = LEGACY_PAGE_ROUTES[window.location.pathname];
    if (!destination) return false;

    var target = new URL(destination, window.location.origin);
    target.search = window.location.search;
    target.hash = window.location.hash;
    window.location.replace(target);
    return true;
  }

  if (redirectLegacyPageRoute()) return;

  function readStoredTheme() {
    try {
      var storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
      return storedTheme === "dark" ? "dark" : "light";
    } catch (_error) {
      return "light";
    }
  }

  function applyTheme(theme, persist) {
    var nextTheme = theme === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;

    document.querySelectorAll("[data-theme-choice]").forEach(function (button) {
      button.setAttribute("aria-pressed", String(button.dataset.themeChoice === nextTheme));
    });

    var themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute("content", nextTheme === "light" ? "#f5f2ea" : "#101918");

    if (persist) {
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      } catch (_error) {
        // The theme still works for this visit when storage is unavailable.
      }
    }
  }

  applyTheme(readStoredTheme(), false);

  function closeMenu(header, toggle) {
    header.dataset.menuOpen = "false";
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open navigation");
  }

  function enhanceHeader(header) {
    if (header.closest("x-dc")) return;
    if (header.dataset.enhanced === "true") return;

    var toggle = header.querySelector(".menu-toggle");
    var nav = header.querySelector(".site-nav");
    if (!toggle || !nav) return;

    header.dataset.enhanced = "true";
    header.dataset.menuOpen = "false";
    toggle.setAttribute("aria-label", "Open navigation");

    toggle.addEventListener("click", function () {
      var open = header.dataset.menuOpen !== "true";
      header.dataset.menuOpen = String(open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
    });

    nav.addEventListener("click", function (event) {
      if (event.target.closest("a")) closeMenu(header, toggle);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && header.dataset.menuOpen === "true") {
        closeMenu(header, toggle);
        toggle.focus();
      }
    });

    document.addEventListener("click", function (event) {
      if (header.dataset.menuOpen === "true" && !header.contains(event.target)) {
        closeMenu(header, toggle);
      }
    });

    window.addEventListener("resize", function () {
      if (window.innerWidth > 900) closeMenu(header, toggle);
    });
  }

  function enhanceThemeSwitch() {
    document.querySelectorAll("[data-theme-choice]").forEach(function (button) {
      button.addEventListener("click", function () {
        applyTheme(button.dataset.themeChoice, true);
      });
    });

    applyTheme(document.documentElement.dataset.theme, false);
  }

  function enhancePage() {
    enhanceThemeSwitch();
    document.querySelectorAll(".site-header").forEach(enhanceHeader);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", enhancePage);
  } else {
    enhancePage();
  }
})();
