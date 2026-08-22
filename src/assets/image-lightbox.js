/**
 * canopy-page's image lightbox — vanilla JS, no dependencies. Wires every
 * `<img>` inside `.canopy-content` so a click opens it full-size in a
 * dismissible overlay, rather than leaving a reader stuck at whatever width
 * the article column happens to render it at.
 *
 * An image an author already wrapped in `<a href="...">` (a common way to
 * work around the lack of a zoom before this script existed) still opens the
 * lightbox first: the overlay shows the same source either way, so the link
 * added nothing a reader couldn't already get from the image itself. The one
 * case left alone is a click that already carries browser intent to open a
 * new tab/window — middle click, or a modifier-held click — which this
 * script never intercepts, so that intent still reaches the ancestor link.
 *
 * `shouldIntercept` is exposed for tests: it is the one piece of this file
 * with real logic, and it needs no DOM to run.
 */
var CanopyImageLightbox = (function () {
  "use strict";

  /** Whether a click should open the lightbox instead of its default action. */
  function shouldIntercept(event) {
    return event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;
  }

  function main() {
    var images = document.querySelectorAll(".canopy-content img");
    if (images.length === 0) return;

    var overlay = document.createElement("div");
    overlay.className = "canopy-lightbox-overlay";
    overlay.hidden = true;

    var overlayImg = document.createElement("img");
    overlay.appendChild(overlayImg);

    var closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "canopy-lightbox-close";
    closeButton.setAttribute("aria-label", "Close");
    overlay.appendChild(closeButton);

    var opener = null;

    function close() {
      overlay.hidden = true;
      document.body.classList.remove("canopy-lightbox-open");
      if (opener) {
        opener.focus();
        opener = null;
      }
    }

    function open(img) {
      overlayImg.src = img.currentSrc || img.src;
      overlayImg.alt = img.alt;
      overlay.hidden = false;
      document.body.classList.add("canopy-lightbox-open");
      opener = img;
      closeButton.focus();
    }

    overlay.addEventListener("click", function (event) {
      if (event.target === overlayImg) return;
      close();
    });
    closeButton.addEventListener("click", close);
    document.addEventListener("keydown", function (event) {
      if (!overlay.hidden && event.key === "Escape") close();
    });

    images.forEach(function (img) {
      img.addEventListener("click", function (event) {
        if (!shouldIntercept(event)) return;
        event.preventDefault();
        event.stopPropagation();
        open(img);
      });
    });

    document.body.appendChild(overlay);
  }

  if (typeof document !== "undefined") main();

  return { shouldIntercept: shouldIntercept };
})();
