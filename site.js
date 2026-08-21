(function () {
  "use strict";

  var THEME_STORAGE_KEY = "galileo-color-theme";
  var LEGACY_PAGE_ROUTES = {
    "/platform.html": "/platform/",
    "/roadmap.html": "/roadmap/",
    "/galileo-browser.html": "/galileo-browser/",
    "/about.html": "/about/",
    "/team.html": "/team/",
    "/github.html": "/github/",
    "/get-involved.html": "/get-involved/",
    "/contributing.html": "/contributing/",
    "/support.html": "/get-involved/",
    "/contact.html": "/contact/",
    "/status.html": "/roadmap/#current-status",
    "/newsletter.html": "/newsletter/",
  };

  function redirectLegacyPageRoute() {
    var destination = LEGACY_PAGE_ROUTES[window.location.pathname];
    if (!destination) return false;

    var target = new URL(destination, window.location.origin);
    target.search = window.location.search;
    if (window.location.hash) target.hash = window.location.hash;
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
    if (themeColor) themeColor.setAttribute("content", nextTheme === "light" ? "#f4f8f5" : "#0d2b25");

    syncGiscusTheme(nextTheme);

    if (persist) {
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      } catch (_error) {
        // The theme still works for this visit when storage is unavailable.
      }
    }
  }

  function syncGiscusTheme(theme) {
    var frame = document.querySelector("iframe.giscus-frame");
    if (!frame || !frame.contentWindow) return;
    frame.contentWindow.postMessage(
      { giscus: { setConfig: { theme: theme === "dark" ? "dark_dimmed" : "light" } } },
      "https://giscus.app",
    );
  }

  applyTheme(readStoredTheme(), false);

  function setNavGroupOpen(group, open) {
    var trigger = group.querySelector(".site-nav__trigger");
    group.dataset.open = String(open);
    if (trigger) trigger.setAttribute("aria-expanded", String(open));
  }

  function closeNavGroups(nav, except) {
    nav.querySelectorAll("[data-nav-group]").forEach(function (group) {
      if (group !== except) setNavGroupOpen(group, false);
    });
  }

  function closeMenu(header, toggle) {
    header.dataset.menuOpen = "false";
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open navigation");
    var nav = header.querySelector(".site-nav");
    if (nav) closeNavGroups(nav);
  }

  function enhanceHeader(header) {
    if (header.closest("x-dc")) return;
    if (header.dataset.enhanced === "true") return;

    var toggle = header.querySelector(".menu-toggle");
    var nav = header.querySelector(".site-nav");
    if (!toggle || !nav) return;

    var desktopThemeSwitch = header.querySelector(".theme-switch");
    if (desktopThemeSwitch && !nav.querySelector(".theme-switch--mobile")) {
      var mobileThemeSwitch = desktopThemeSwitch.cloneNode(true);
      mobileThemeSwitch.classList.add("theme-switch--mobile");
      mobileThemeSwitch.setAttribute("aria-label", "Color theme on mobile");
      nav.appendChild(mobileThemeSwitch);
    }

    header.dataset.enhanced = "true";
    header.dataset.menuOpen = "false";
    toggle.setAttribute("aria-label", "Open navigation");

    nav.querySelectorAll("[data-nav-group]").forEach(function (group) {
      var trigger = group.querySelector(".site-nav__trigger");
      var menu = group.querySelector(".site-nav__menu");
      if (!trigger || !menu) return;

      setNavGroupOpen(group, false);
      trigger.addEventListener("click", function () {
        var open = group.dataset.open !== "true";
        closeNavGroups(nav, group);
        setNavGroupOpen(group, open);
      });
      trigger.addEventListener("keydown", function (event) {
        if (event.key !== "ArrowDown") return;
        event.preventDefault();
        closeNavGroups(nav, group);
        setNavGroupOpen(group, true);
        var firstLink = menu.querySelector("a");
        if (firstLink) firstLink.focus();
      });
    });

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
      var openGroup = nav.querySelector('[data-nav-group][data-open="true"]');
      if (event.key === "Escape" && openGroup) {
        var trigger = openGroup.querySelector(".site-nav__trigger");
        setNavGroupOpen(openGroup, false);
        if (trigger) trigger.focus();
        return;
      }
      if (event.key === "Escape" && header.dataset.menuOpen === "true") {
        closeMenu(header, toggle);
        toggle.focus();
      }
    });

    document.addEventListener("click", function (event) {
      if (header.dataset.menuOpen === "true" && !header.contains(event.target)) {
        closeMenu(header, toggle);
      }
      if (!event.target.closest("[data-nav-group]")) closeNavGroups(nav);
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

  function enhanceDiscussionComments() {
    var host = document.querySelector("[data-giscus-comments]");
    if (!host) return;

    syncGiscusTheme(document.documentElement.dataset.theme);

    var observer = new MutationObserver(function () {
      if (!host.querySelector("iframe.giscus-frame")) return;
      syncGiscusTheme(document.documentElement.dataset.theme);
      observer.disconnect();
    });
    observer.observe(host, { childList: true, subtree: true });

    window.addEventListener("message", function (event) {
      if (event.origin === "https://giscus.app") {
        syncGiscusTheme(document.documentElement.dataset.theme);
      }
    });
  }

  function enhancePage() {
    document.querySelectorAll(".site-header").forEach(enhanceHeader);
    enhanceThemeSwitch();
    enhanceDiscussionComments();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", enhancePage);
  } else {
    enhancePage();
  }
})();
