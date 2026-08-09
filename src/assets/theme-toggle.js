/**
 * canopy-page's dark/light toggle — vanilla JS, no dependencies. Wires the
 * `.canopy-theme-toggle` hidden button canopy's shell always carries when a
 * top bar exists, and flips `data-theme` on `<html>`, the attribute canopy's
 * own stylesheet reads to override `prefers-color-scheme` (see canopy's
 * tokens.ts).
 *
 * `effectiveTheme` and `nextTheme` are exposed for tests, which is also why
 * the resolution logic is split out as pure functions taking primitives
 * rather than reading `matchMedia`/`data-theme` inline — the same shape
 * search.js's `searchIndex` and scrollspy.js's `pickActive` already use.
 */
var CanopyThemeToggle = (function () {
  "use strict";

  var STORAGE_KEY = "canopy-theme";

  /**
   * The theme actually in effect right now: an explicit data-theme
   * attribute if one is set, otherwise the system preference. This is the
   * "current" a click toggles away from — computing it fresh (rather than
   * trusting a stored value) is what makes a first click always flip the
   * theme the reader is actually looking at, even if that reader never
   * clicked before and nothing was ever stored.
   */
  function effectiveTheme(dataThemeAttr, systemPrefersDark) {
    if (dataThemeAttr === "dark" || dataThemeAttr === "light") return dataThemeAttr;
    return systemPrefersDark ? "dark" : "light";
  }

  /** The theme a click moves to: simply the other one. */
  function nextTheme(current) {
    return current === "dark" ? "light" : "dark";
  }

  function systemPrefersDark() {
    return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
  }

  // Storage access can throw (private browsing with storage disabled, a
  // strict cookie/storage policy) — every call here is wrapped so that a
  // reader who cannot persist a preference still gets a fully working
  // toggle for the rest of the session, just not a remembered one.
  function readStored() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  function writeStored(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      // Nothing to recover: the theme is still applied for this page view.
    }
  }

  function main() {
    var button = document.querySelector(".canopy-theme-toggle");
    if (!button) return;

    var stored = readStored();
    if (stored === "dark" || stored === "light") {
      document.documentElement.setAttribute("data-theme", stored);
    }

    button.addEventListener("click", function () {
      var current = effectiveTheme(
        document.documentElement.getAttribute("data-theme"),
        systemPrefersDark(),
      );
      var theme = nextTheme(current);
      document.documentElement.setAttribute("data-theme", theme);
      writeStored(theme);
    });

    // A script that ran this far can wire the button up — reveal it now,
    // and not before, the same reasoning search.js's form reveal uses.
    button.hidden = false;
  }

  if (typeof document !== "undefined") main();

  return { effectiveTheme: effectiveTheme, nextTheme: nextTheme };
})();
