/**
 * canopy-page's client search — vanilla JS, no dependencies. Wires the
 * `.canopy-search` form canopy's shell emits when `--search-index` and
 * `--script` are both given.
 *
 * Substring matching, not stemming: Korean attaches particles to a word stem
 * (주문 -> 주문을/주문이), so a substring search already finds the stem
 * inside the inflected form — English queries use the same code path.
 *
 * One global (`CanopySearch`), so this adds exactly one name to whatever
 * page carries it. `searchIndex` is exposed for tests, which load and
 * evaluate this exact file rather than reimplementing it (search-ui.test.ts).
 */
var CanopySearch = (function () {
  "use strict";

  function normalize(s) {
    return s.normalize("NFC").toLowerCase();
  }

  /**
   * Score one entry against a query's terms. Every term has to appear
   * somewhere (title, a heading, or the body) or the entry is dropped — an
   * OR across terms would surface pages matching none of what was typed.
   */
  function scoreEntry(entry, terms) {
    var title = normalize(entry.t);
    var headings = entry.h.map(normalize);
    var body = normalize(entry.b);
    var score = 0;
    for (var i = 0; i < terms.length; i++) {
      var term = terms[i];
      var inTitle = title.indexOf(term) !== -1;
      var inHeading = headings.some(function (h) {
        return h.indexOf(term) !== -1;
      });
      var inBody = body.indexOf(term) !== -1;
      if (!inTitle && !inHeading && !inBody) return 0;
      if (inTitle) score += 3;
      if (inHeading) score += 2;
      if (inBody) score += 1;
    }
    return score;
  }

  /** A short excerpt around the first matched term, for the result list. */
  function snippet(entry, terms) {
    var body = entry.b;
    var lower = normalize(body);
    var at = -1;
    for (var i = 0; i < terms.length; i++) {
      at = lower.indexOf(terms[i]);
      if (at !== -1) break;
    }
    if (at === -1) return body.slice(0, 100);
    var start = Math.max(0, at - 40);
    var end = Math.min(body.length, at + 60);
    return (start > 0 ? "…" : "") + body.slice(start, end) + (end < body.length ? "…" : "");
  }

  /** Search `entries` (the parsed search-index.json) for `query`. */
  function searchIndex(entries, query, limit) {
    var terms = normalize(query).split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];
    var results = [];
    for (var i = 0; i < entries.length; i++) {
      var score = scoreEntry(entries[i], terms);
      if (score > 0) {
        results.push({ entry: entries[i], score: score, snippet: snippet(entries[i], terms) });
      }
    }
    results.sort(function (a, b) {
      return b.score - a.score;
    });
    return results.slice(0, limit || 10);
  }

  // DOM wiring below is skipped outside a browser, so this file stays
  // loadable in a plain Node sandbox for the test above.

  var SCRIPT_SRC =
    typeof document !== "undefined" && document.currentScript ? document.currentScript.src : "";

  function main() {
    var form = document.querySelector(".canopy-search");
    var input = form ? form.querySelector("input[type=search]") : null;
    if (!form || !input) return;

    // canopy always writes this script to assets/script.js at the site root
    // and links it relatively, so the resolved URL minus that suffix is the
    // site root — the same root the index and every result link resolve
    // against.
    var root = SCRIPT_SRC.replace(/assets\/script\.js(\?.*)?$/, "");
    var indexUrl = root + "search-index.json";

    var list = document.createElement("ul");
    list.className = "canopy-search-results";
    list.hidden = true;
    list.setAttribute("role", "listbox");
    form.appendChild(list);

    var indexPromise = null;
    function loadIndex() {
      if (!indexPromise) {
        indexPromise = fetch(indexUrl).then(function (response) {
          if (!response.ok) throw new Error("search index request failed");
          return response.json();
        });
      }
      return indexPromise;
    }

    var active = -1;

    function render(results) {
      active = -1;
      list.textContent = "";
      if (results.length === 0) {
        list.hidden = true;
        return;
      }
      results.forEach(function (result) {
        var item = document.createElement("li");
        item.setAttribute("role", "option");
        var link = document.createElement("a");
        link.href = root + result.entry.p;
        link.textContent = result.entry.t;
        var preview = document.createElement("p");
        preview.className = "canopy-search-snippet";
        preview.textContent = result.snippet;
        item.appendChild(link);
        item.appendChild(preview);
        list.appendChild(item);
      });
      list.hidden = false;
    }

    var pending;
    function handleInput() {
      var query = input.value;
      clearTimeout(pending);
      pending = setTimeout(function () {
        if (query.trim() === "") {
          render([]);
          return;
        }
        loadIndex()
          .then(function (entries) {
            render(searchIndex(entries, query, 10));
          })
          .catch(function () {
            list.textContent = "";
            var item = document.createElement("li");
            item.textContent = "Search failed to load.";
            list.appendChild(item);
            list.hidden = false;
          });
      }, 120);
    }

    function setActive(index) {
      var items = list.children;
      if (active >= 0 && items[active]) items[active].classList.remove("is-active");
      active = index;
      if (active >= 0 && items[active]) {
        items[active].classList.add("is-active");
        items[active].scrollIntoView({ block: "nearest" });
      }
    }

    function handleKeydown(event) {
      if (list.hidden || list.children.length === 0) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive((active + 1) % list.children.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive((active - 1 + list.children.length) % list.children.length);
      } else if (event.key === "Enter") {
        var target = active >= 0 ? list.children[active] : list.children[0];
        var link = target && target.querySelector("a");
        if (link) {
          event.preventDefault();
          location.href = link.href;
        }
      } else if (event.key === "Escape") {
        render([]);
      }
    }

    input.addEventListener("focus", loadIndex, { once: true });
    input.addEventListener("input", handleInput);
    input.addEventListener("keydown", handleKeydown);
    document.addEventListener("click", function (event) {
      if (!form.contains(event.target)) list.hidden = true;
    });

    // Ctrl+K / Cmd+K jumps to search from anywhere on the page — the
    // convention readers already know from editors and other doc sites.
    // Global rather than scoped to the form, since the point is not having
    // to click the form first.
    document.addEventListener("keydown", function (event) {
      var key = (event.key || "").toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "k") {
        event.preventDefault();
        input.focus();
        input.select();
      }
    });

    // A script that ran this far is a script that can wire the form up —
    // reveal it now, and not before, so a build with no script attached
    // (or one that throws before this point) never shows a dead control.
    form.hidden = false;
  }

  if (typeof document !== "undefined") main();

  return { searchIndex: searchIndex };
})();
