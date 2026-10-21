// Runs on every page so the side panel can highlight the matching tile
// when the user hovers over a photo directly on the webpage.
(function () {
  let lastSrc = null;

  // After the extension is reloaded, this old copy of the script stays in
  // already-open tabs and sendMessage throws "Extension context invalidated"
  // synchronously (not as a rejected promise), so .catch() alone misses it.
  function send(message) {
    try {
      if (!chrome.runtime || !chrome.runtime.id) return; // extension was reloaded/removed
      chrome.runtime.sendMessage(message).catch(() => {
        // Side panel may not be open / listening; safe to ignore.
      });
    } catch (e) {
      // Extension context invalidated; the tab just needs a refresh.
    }
  }

  document.addEventListener(
    "mouseover",
    (e) => {
      const img = e.target.closest ? e.target.closest("img") : null;
      if (!img) return;
      const src = img.currentSrc || img.src || "";
      if (!src || src === lastSrc) return;
      lastSrc = src;
      send({ type: "IMAGE_HOVER", src });
    },
    true
  );

  document.addEventListener(
    "mouseout",
    (e) => {
      const img = e.target.closest ? e.target.closest("img") : null;
      if (!img) return;
      lastSrc = null;
      send({ type: "IMAGE_HOVER_END" });
    },
    true
  );
})();
