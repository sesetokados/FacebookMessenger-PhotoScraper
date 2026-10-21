// Shared by the side panel (sidepanel.html) and the background service worker
// (background.js, via importScripts): file naming and the Messenger
// full-quality lookup, so both download paths name and fetch photos the same way.

// --- File naming ------------------------------------------------------------------

// Choices offered in the "Save as" dropdown (side panel and the Messenger
// menu form). Any other name can still be typed in.
const SAVE_AS_PRESETS = ["SAMPLING", "SELLING", "ACTIVITY"];

// Adds a dropdown to a text input that always lists every preset, even when
// something is already typed (a <datalist> would hide the ones that don't
// match). It opens when the input is focused or the ▾ button is pressed.
// Picking one fills the input and fires an "input" event; other names can
// still be typed.
function attachPresetDropdown(input, presets = SAVE_AS_PRESETS) {
  const doc = input.ownerDocument;
  const wrap = doc.createElement("span");
  wrap.style.cssText = "position:relative;display:flex;align-items:stretch;";
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);
  input.style.flex = "1 1 auto"; // still fills the row next to the ▾ button
  input.style.minWidth = "0";

  const button = doc.createElement("button");
  button.type = "button";
  button.textContent = "▾";
  button.title = "Choose a preset";
  button.style.cssText = "margin-left:2px;padding:0 6px;cursor:pointer;font:inherit;";
  wrap.appendChild(button);

  const list = doc.createElement("div");
  list.style.cssText =
    "display:none;position:absolute;top:100%;left:0;min-width:100%;z-index:1000;margin-top:2px;" +
    "background:Canvas;color:CanvasText;border:1px solid rgba(128,128,128,0.5);border-radius:6px;" +
    "box-shadow:0 4px 12px rgba(0,0,0,0.2);padding:3px 0;";
  const show = () => (list.style.display = "block");
  const hide = () => (list.style.display = "none");
  const isOpen = () => list.style.display !== "none";

  presets.forEach((preset) => {
    const option = doc.createElement("div");
    option.textContent = preset;
    option.style.cssText = "padding:5px 10px;cursor:pointer;white-space:nowrap;";
    option.addEventListener("mouseenter", () => (option.style.background = "rgba(128,128,128,0.2)"));
    option.addEventListener("mouseleave", () => (option.style.background = ""));
    // mousedown (not click) so the input keeps focus and the list doesn't close first.
    option.addEventListener("mousedown", (e) => {
      e.preventDefault();
      input.value = preset;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      hide();
    });
    list.appendChild(option);
  });
  wrap.appendChild(list);

  input.addEventListener("focus", show);
  input.addEventListener("blur", hide);
  input.addEventListener("keydown", (e) => {
    // Esc closes just the list (not a dialog the input is in).
    if (e.key === "Escape" && isOpen()) {
      hide();
      e.stopPropagation();
    }
  });
  button.addEventListener("mousedown", (e) => {
    e.preventDefault();
    if (isOpen()) {
      hide();
    } else {
      input.focus();
      show();
    }
  });
}

function getExtensionFromSrc(src) {
  try {
    const url = new URL(src);
    const last = url.pathname.split("/").filter(Boolean).pop();
    const match = last && last.match(/\.([a-zA-Z0-9]+)$/);
    if (match) return match[1];
  } catch (e) {
    // fall through
  }
  return "jpg";
}

function formatDateForFilename(yyyyMmDd) {
  const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  if (!y || !m || !d) return "";
  const yy = String(y).slice(-2);
  const dd = String(d).padStart(2, "0");
  return `${MONTHS[m - 1]}-${dd}-${yy}`;
}

// Windows and chrome.downloads both reject these characters in file names,
// so swap them out instead of letting the save fail.
function sanitizeForFilename(text) {
  return text
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "");
}

// "school" + "2026-09-09" -> "school_sep-09-26"
function buildBaseName(prefixText, dateValue) {
  const prefix = sanitizeForFilename(prefixText || "");
  const dateStr = dateValue ? formatDateForFilename(dateValue) : "";
  if (prefix && dateStr) return `${prefix}_${dateStr}`;
  if (prefix) return prefix;
  if (dateStr) return dateStr;
  return "";
}

function filenameFor(src, order, base) {
  const ext = getExtensionFromSrc(src);

  if (base) {
    // "school" + date -> "school_sep-09-26 (1).jpg", "... (2).jpg", ...
    return `${base} (${order}).${ext}`;
  }

  try {
    const url = new URL(src);
    const last = url.pathname.split("/").filter(Boolean).pop();
    if (last && /\.[a-zA-Z0-9]+$/.test(last)) {
      return `${String(order).padStart(3, "0")}_${last}`;
    }
  } catch (e) {
    // fall through to default name
  }
  return `image_${String(order).padStart(3, "0")}.jpg`;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Highest N already used by a file named "<base> (N).<ext>", or 0 if none.
function maxNumberForBase(names, base) {
  const re = new RegExp(`^${escapeRegExp(base)} \\((\\d+)\\)\\.[a-z0-9]+$`, "i");
  let max = 0;
  for (const name of names) {
    const m = name.match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
}

// We can't read the Downloads folder directly, but Chrome remembers the
// files it downloaded there (and whether they still exist on disk).
async function listDownloadedFileNames(base) {
  try {
    const items = await chrome.downloads.search({
      filenameRegex: `(?i)${escapeRegExp(base)} \\(\\d+\\)\\.[a-z0-9]+$`,
      exists: true,
      limit: 0,
    });
    return items.map((d) => d.filename.split(/[\\/]/).pop());
  } catch (err) {
    console.error("Couldn't check previous downloads:", err);
    return [];
  }
}

function makeUnique(filename, taken) {
  if (!taken.has(filename.toLowerCase())) return filename;
  const dot = filename.lastIndexOf(".");
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  const ext = dot > 0 ? filename.slice(dot) : "";
  let k = 2;
  while (taken.has(`${stem} (${k})${ext}`.toLowerCase())) k++;
  return `${stem} (${k})${ext}`;
}

// How many photos are fetched/saved at the same time.
const DOWNLOAD_CONCURRENCY = 4;

// Runs worker(0..count-1) with at most `limit` running at once.
async function runWithConcurrency(count, limit, worker) {
  let nextIndex = 0;
  async function lane() {
    while (nextIndex < count) {
      const i = nextIndex++;
      await worker(i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, count) }, lane));
}

// --- Messenger full quality -------------------------------------------------------

// This function is injected into the page. It must be self-contained.
// Opens a Messenger chat photo in its viewer and reads the full-size URL the
// viewer's download button points at. The thumbnail and full-size URLs share
// the same file name (only the query differs), so matching by file name works
// in any UI language.
//
// To save time the viewer is left open between photos: `openKey` is the file
// name of the photo whose viewer is still open, and with `reuse` the next
// thumbnail is clicked straight away instead of closing the viewer first. If
// that doesn't switch photos, it falls back to close-then-open and reports
// `reuseFailed` so the caller stops trying. `closeOnly` just closes the viewer.
// With `scrollSearch`, a thumbnail that isn't loaded yet is looked for by
// scrolling the chat upward (used in the separate worker tab, which opens at
// the newest messages).
async function getFullResFromViewer({ thumbSrc, openKey, reuse, closeOnly, scrollSearch }) {
  function fileKey(url) {
    try {
      return new URL(url, document.baseURI).pathname.split("/").pop() || "";
    } catch (e) {
      return "";
    }
  }

  // Resolves with check()'s first truthy value, reacting to DOM changes
  // immediately instead of polling on a fixed delay; null on timeout.
  function waitFor(check, timeout) {
    return new Promise((resolve) => {
      const first = check();
      if (first) return resolve(first);
      let obs = null;
      let timer = null;
      let timeoutId = null;
      const finish = (value) => {
        if (obs) obs.disconnect();
        clearInterval(timer);
        clearTimeout(timeoutId);
        resolve(value);
      };
      const test = () => {
        const value = check();
        if (value) finish(value);
      };
      obs = new MutationObserver(test);
      obs.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["href", "src"],
      });
      timer = setInterval(test, 100); // image loads don't trigger mutations
      timeoutId = setTimeout(() => finish(check() || null), timeout);
    });
  }

  // The viewer's download link for photo `k` (not present in the chat itself).
  function viewerLink(k) {
    return document.querySelector(`a[href*="${k}"]`);
  }

  async function closeViewer(k) {
    if (!k || !viewerLink(k)) return;
    const keyOpts = { key: "Escape", code: "Escape", keyCode: 27, which: 27, bubbles: true, cancelable: true };
    const target = document.activeElement || document.body;
    target.dispatchEvent(new KeyboardEvent("keydown", keyOpts));
    target.dispatchEvent(new KeyboardEvent("keyup", keyOpts));
    if (await waitFor(() => !viewerLink(k), 1500)) return;
    const closeBtn = document.querySelector('[aria-label="Close"], [aria-label="Isara"]');
    if (closeBtn) closeBtn.click();
    await waitFor(() => !viewerLink(k), 1500);
  }

  if (closeOnly) {
    await closeViewer(openKey);
    return { full: null, openKey: null, reuseFailed: false };
  }

  const key = fileKey(thumbSrc);
  if (!key) return { full: null, openKey, reuseFailed: false };

  function findThumb() {
    const imgs = Array.from(document.images);
    return (
      imgs.find((img) => (img.currentSrc || img.src) === thumbSrc) ||
      imgs.find((img) => fileKey(img.currentSrc || img.src) === key) ||
      null
    );
  }

  async function openAndWait(thumb, timeout) {
    const thumbWidth = thumb.naturalWidth;
    // No scrolling: a programmatic click works even when the photo is off-screen.
    thumb.click();
    return waitFor(() => {
      const link = viewerLink(key);
      if (link) return link.href;
      const big = Array.from(document.images).find(
        (img) =>
          img !== thumb &&
          fileKey(img.currentSrc || img.src) === key &&
          img.naturalWidth > thumbWidth
      );
      return big ? big.currentSrc || big.src : null;
    }, timeout);
  }

  // Largest scrollable area on the page: Messenger scrolls an inner <div>.
  function findChatScroller() {
    let best = null;
    let bestArea = 0;
    for (const el of document.querySelectorAll("*")) {
      const style = getComputedStyle(el);
      const canScroll = style.overflowY === "auto" || style.overflowY === "scroll";
      if (canScroll && el.scrollHeight > el.clientHeight + 40) {
        const area = el.clientWidth * el.clientHeight;
        if (area > bestArea) {
          bestArea = area;
          best = el;
        }
      }
    }
    return best || document.scrollingElement || document.documentElement;
  }

  async function scrollUpUntilFound() {
    const scroller = findChatScroller();
    for (let i = 0; i < 40; i++) {
      if (scroller.scrollTop <= 0) {
        // At the top: give Messenger a moment to load older messages.
        const loaded = await waitFor(() => scroller.scrollTop > 0 || findThumb(), 2000);
        if (!loaded) return null;
        if (findThumb()) return findThumb();
      }
      scroller.scrollTop -= Math.max(200, scroller.clientHeight * 0.8);
      const found = await waitFor(findThumb, 800);
      if (found) return found;
    }
    return null;
  }

  let reuseFailed = false;
  let thumb = findThumb();

  // Close the previous viewer first when not reusing it, or when the chat
  // behind it isn't reachable (e.g. Messenger unmounts it while open).
  if (openKey && (!reuse || !thumb)) {
    const hadThumb = !!thumb;
    await closeViewer(openKey);
    openKey = null;
    thumb = findThumb();
    // Only reachable once the viewer closed: reusing the viewer doesn't work here.
    if (reuse && !hadThumb && thumb) reuseFailed = true;
  }
  if (!thumb && scrollSearch) thumb = await scrollUpUntilFound();
  if (!thumb) return { full: null, openKey: null, reuseFailed }; // scrolled away

  let full = await openAndWait(thumb, openKey ? 1500 : 8000);
  if (!full && openKey) {
    // Clicking behind the open viewer didn't switch photos.
    reuseFailed = true;
    await closeViewer(openKey);
    thumb = findThumb();
    if (thumb) full = await openAndWait(thumb, 8000);
  }
  return { full, openKey: full ? key : null, reuseFailed };
}
