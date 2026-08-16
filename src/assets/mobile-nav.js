/**
 * canopy-page's mobile nav default — vanilla JS, no dependencies. Wires the
 * `<details class="canopy-nav" open>` disclosure canopy's shell always ships
 * open: canopy itself writes no JavaScript (see canopy's docs/SCOPE.md), so
 * a static page has no way to default that state per breakpoint on its own,
 * and `open` has to pick one default for every viewport. It picks the safe
 * one — a script-free reader on any screen still gets a working, fully
 * visible navigation — but on a narrow viewport that leaves every fresh page
 * load showing the full site navigation (canopy's shell renders an open
 * `.canopy-nav` there as a full-screen overlay) in front of the article a
 * reader actually followed a link to see.
 *
 * This script narrows that default, never widens it: a wide viewport is left
 * exactly as canopy's shell already renders it (open, no toggle needed). On
 * a narrow one it starts closed, unless the reader already chose to leave it
 * open earlier in the same session — sessionStorage rather than
 * localStorage, since a stale "open" choice from a different visit days ago
 * would be more surprising than useful.
 *
 * `shouldOpenOnLoad` is exposed for tests: it is the one piece of this file
 * with real logic, and it needs no DOM to run.
 */
var CanopyMobileNav = (function () {
  "use strict";

  var STORAGE_KEY = "canopy-nav-open";
  var NARROW_QUERY = "(max-width: 40rem)";

  /**
   * Whether the nav should start open, given the viewport it's rendering at
   * and the reader's last explicit choice this session (undefined if they
   * never toggled it). A wide viewport always opens — matching the shell's
   * own always-there design there, which this script only ever narrows for
   * a narrow viewport, never overrides for a wide one. A narrow viewport
   * starts closed unless the reader explicitly left it open last time.
   */
  function shouldOpenOnLoad(isNarrowViewport, storedChoice) {
    if (!isNarrowViewport) return true;
    return storedChoice === "open";
  }

  function readStoredChoice() {
    try {
      return sessionStorage.getItem(STORAGE_KEY) || undefined;
    } catch (e) {
      // Storage access can throw (private browsing with storage disabled) —
      // a reader who hits that just gets the narrow-viewport default every
      // load, not a broken page.
      return undefined;
    }
  }

  function storeChoice(open) {
    try {
      sessionStorage.setItem(STORAGE_KEY, open ? "open" : "closed");
    } catch (e) {
      // Same as above: a reader who can't write storage just loses the
      // memory across pages, not the toggle itself.
    }
  }

  function main() {
    var nav = document.querySelector(".canopy-nav");
    if (!nav || typeof matchMedia !== "function") return;

    var isNarrow = matchMedia(NARROW_QUERY).matches;
    nav.open = shouldOpenOnLoad(isNarrow, readStoredChoice());

    // A reader's own click (native <details> toggling, no JS involved in the
    // click itself) still fires this — the same event a script-driven
    // assignment above fires too, so the very first automatic close is
    // recorded as "closed" for free rather than needing a separate write.
    nav.addEventListener("toggle", function () {
      storeChoice(nav.open);
    });
  }

  if (typeof document !== "undefined") main();

  return { shouldOpenOnLoad: shouldOpenOnLoad };
})();
