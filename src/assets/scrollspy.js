/**
 * canopy-page's on-page outline scrollspy — vanilla JS, no dependencies.
 * Marks whichever `.canopy-outline` link points at the heading currently in
 * view with `aria-current="location"`, the same attribute browsers already
 * use for "current place in a set" (MDN: aria-current). No new class name,
 * so a caller who wants to restyle it only needs `[aria-current="location"]`.
 *
 * `pickActive` is exposed for tests: it is the one piece of this file with
 * real logic (choosing among several simultaneously-visible headings), and
 * it needs no DOM to run.
 */
var CanopyScrollspy = (function () {
  "use strict";

  /**
   * Given the outline's heading ids in document order and the subset
   * currently intersecting the viewport, pick the one to mark current.
   *
   * The topmost visible heading wins — not the one with the largest
   * intersection ratio, since a short section near the top of the viewport
   * can be fully visible while a long section just below it is only
   * fractionally visible, and a reader who just scrolled to that short
   * section expects it, not its taller neighbor, to light up.
   */
  function pickActive(orderedIds, visibleIds) {
    if (visibleIds.length === 0) return null;
    var visible = new Set(visibleIds);
    for (var i = 0; i < orderedIds.length; i++) {
      if (visible.has(orderedIds[i])) return orderedIds[i];
    }
    return null;
  }

  function main() {
    var outline = document.querySelector(".canopy-outline");
    if (!outline) return;
    var links = outline.querySelectorAll("a[href^='#']");
    if (links.length === 0) return;

    var orderedIds = [];
    var linkById = {};
    links.forEach(function (link) {
      var id = link.getAttribute("href").slice(1);
      orderedIds.push(id);
      linkById[id] = link;
    });

    var headings = orderedIds
      .map(function (id) {
        return document.getElementById(id);
      })
      .filter(Boolean);
    if (headings.length === 0) return;

    if (typeof IntersectionObserver === "undefined") return;

    var current = null;
    function setCurrent(id) {
      if (id === current) return;
      if (current !== null && linkById[current]) {
        linkById[current].removeAttribute("aria-current");
      }
      current = id;
      if (current !== null && linkById[current]) {
        linkById[current].setAttribute("aria-current", "location");
      }
    }

    var visible = [];
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          var id = entry.target.id;
          var at = visible.indexOf(id);
          if (entry.isIntersecting) {
            if (at === -1) visible.push(id);
          } else if (at !== -1) {
            visible.splice(at, 1);
          }
        });
        setCurrent(pickActive(orderedIds, visible));
      },
      // A heading counts as "in view" while it sits in a band from the
      // upper tenth to the upper third of the viewport — narrow enough that
      // a reader scrolling past a short section still sees it light up, but
      // wide enough to actually be a non-empty band (top + bottom margins
      // here must sum to under 100%, or the observed strip is zero-height).
      { rootMargin: "-10% 0px -70% 0px" },
    );
    headings.forEach(function (heading) {
      observer.observe(heading);
    });
  }

  if (typeof document !== "undefined") main();

  return { pickActive: pickActive };
})();
