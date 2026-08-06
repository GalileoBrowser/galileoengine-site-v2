(function () {
  "use strict";

  function closeMenu(header, toggle) {
    header.dataset.menuOpen = "false";
    toggle.setAttribute("aria-expanded", "false");
  }

  function enhanceHeader(header) {
    if (header.closest("x-dc")) return;
    if (header.dataset.enhanced === "true") return;

    var toggle = header.querySelector(".menu-toggle");
    var nav = header.querySelector(".site-nav");
    if (!toggle || !nav) return;

    header.dataset.enhanced = "true";
    header.dataset.menuOpen = "false";

    toggle.addEventListener("click", function () {
      var open = header.dataset.menuOpen !== "true";
      header.dataset.menuOpen = String(open);
      toggle.setAttribute("aria-expanded", String(open));
    });

    nav.addEventListener("click", function (event) {
      if (event.target.closest("a")) closeMenu(header, toggle);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
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

  function enhancePage() {
    document.querySelectorAll(".site-header").forEach(enhanceHeader);
  }

  document.addEventListener("DOMContentLoaded", enhancePage);

  var observer = new MutationObserver(enhancePage);
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
