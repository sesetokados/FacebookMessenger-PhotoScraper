// Runs on Facebook/Messenger. When the "More actions" (⋯) menu of a photo
// message opens, adds a "Download photos" item to it. Clicking it hands the
// message's photos to the side panel, which downloads them with the same
// naming, folder and full-quality settings as a normal download.
(function () {
  const INJECTED_ATTR = "data-pip-download";
  const SENT_LABEL_PREFIX = "Enter, Message sent"; // one per message in the chat

  // The photos of the message whose ⋯ button opened the menu. Walks up from
  // the button to the first ancestor that contains chat photos, but stops if
  // that ancestor already spans more than one message.
  function photosForTrigger(trigger) {
    for (let el = trigger.parentElement, depth = 0; el && depth < 14; el = el.parentElement, depth++) {
      if (el.querySelectorAll(`[aria-label^="${SENT_LABEL_PREFIX}"]`).length > 1) return [];
      const photos = Array.from(el.querySelectorAll("img")).filter((img) => {
        const src = img.currentSrc || img.src || "";
        // Skip avatars and icons: chat photos are rendered well over 60px wide.
        return src.includes("fbcdn.net") && img.naturalWidth > 80 && img.getBoundingClientRect().width >= 60;
      });
      if (photos.length) return photos;
    }
    return [];
  }

  // False once the extension has been reloaded/removed: this old copy of the
  // script stays in open tabs but can no longer talk to the extension.
  function extensionAlive() {
    try {
      return !!(chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  // sendMessage that never throws: resolves null when nobody answers (e.g. the
  // side panel is closed) or when the extension context is gone. The latter
  // throws synchronously, which .catch() alone wouldn't handle.
  async function sendSafe(message) {
    try {
      return await chrome.runtime.sendMessage(message);
    } catch (e) {
      return null;
    }
  }

  function showToast(text) {
    const toast = document.createElement("div");
    toast.textContent = text;
    Object.assign(toast.style, {
      position: "fixed",
      left: "50%",
      bottom: "32px",
      transform: "translateX(-50%)",
      background: "rgba(0, 0, 0, 0.85)",
      color: "#fff",
      padding: "10px 16px",
      borderRadius: "8px",
      font: "14px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      zIndex: "2147483647",
      maxWidth: "80vw",
      textAlign: "center",
    });
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  // Same as the user pressing Esc: sent to the focused menu item, not the menu.
  function closeMenu(menu) {
    const opts = { key: "Escape", code: "Escape", keyCode: 27, which: 27, bubbles: true, cancelable: true };
    const target = menu.contains(document.activeElement) ? document.activeElement : menu;
    target.dispatchEvent(new KeyboardEvent("keydown", opts));
    target.dispatchEvent(new KeyboardEvent("keyup", opts));
  }

  function isScrollable(el) {
    const oy = getComputedStyle(el).overflowY;
    return (oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 10;
  }

  // The chat's scroll container: the nearest scrollable ancestor of one of the
  // message's photos (the role="log" element is not an ancestor of it).
  function findChatScroller(anchor) {
    for (let el = anchor && anchor.parentElement; el && el !== document.body; el = el.parentElement) {
      if (isScrollable(el)) return el;
    }
    return null;
  }

  // How long to keep holding after the download finishes; Messenger's own
  // scrolling was seen to run for about 3 seconds after the menu closed.
  const HOLD_AFTER_DONE_MS = 4000;

  // Keeps the chat where it is until the returned release() is called.
  // Right after a menu download, Messenger calls scrollIntoView() on a message
  // and smooth-scrolls the chat up; this undoes that right away. Any real
  // scrolling by the user (wheel, touch, dragging the scrollbar) releases it.
  function holdChatScroll(anchor) {
    const scroller = findChatScroller(anchor);
    if (!scroller) return () => {};
    const top = scroller.scrollTop;
    const userScrollEvents = ["wheel", "touchstart", "mousedown"];
    let released = false;
    let safety = null;
    const onScroll = () => {
      if (Math.abs(scroller.scrollTop - top) > 1) scroller.scrollTop = top;
    };
    const release = () => {
      if (released) return;
      released = true;
      clearTimeout(safety);
      scroller.removeEventListener("scroll", onScroll);
      userScrollEvents.forEach((type) => scroller.removeEventListener(type, release));
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    userScrollEvents.forEach((type) => scroller.addEventListener(type, release, { passive: true }));
    safety = setTimeout(release, 2 * 60 * 1000); // never hold longer than 2 minutes
    return release;
  }

  // Released a little after the side panel (or background) says the download
  // finished. The background also sends a summary, since there's no side panel
  // to show one.
  let releaseScroll = null;
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || msg.type !== "MESSAGE_PHOTOS_DONE") return;
    if (releaseScroll) {
      const release = releaseScroll;
      releaseScroll = null;
      setTimeout(release, HOLD_AFTER_DONE_MS);
    }
    const s = msg.summary;
    if (s) {
      const FOLDER_PROBLEMS = {
        permission: "Chrome no longer allows saving to your chosen folder. Open the side panel once to reconnect it.",
        missing: "Your chosen folder wasn't found (moved or renamed?).",
        error: "Couldn't save to your chosen folder.",
      };
      showToast(
        `Saved ${s.done} photo(s) to ${s.savedTo ? `"${s.savedTo}"` : "your Downloads folder"}` +
          (s.failed ? ` • ${s.failed} failed` : "") +
          (s.lowQuality ? ` • ${s.lowQuality} low quality` : "") +
          "." +
          (s.folderProblem ? ` ${FOLDER_PROBLEMS[s.folderProblem] || FOLDER_PROBLEMS.error}` : "")
      );
    }
  });

  // Asks for the "Save as" name and date when the side panel is closed.
  // Both are remembered between downloads (and shared with the side panel),
  // since consecutive downloads usually use the same ones.
  // Resolves { name, date } or null.
  async function askNameAndDate(photoSrcs) {
    let savedName = "";
    let savedDate = "";
    let destPath = null;
    try {
      const saved = await chrome.storage.local.get(["filenamePrefix", "filenameDate", "destPath"]);
      savedName = saved.filenamePrefix || "";
      savedDate = saved.filenameDate || "";
      destPath = Array.isArray(saved.destPath) && saved.destPath.length ? saved.destPath : null;
    } catch (err) {
      console.error("Couldn't load the saved date/folder:", err);
    }

    return new Promise((resolve) => {
      // Shadow DOM keeps Facebook's styles out of the form (and ours out of Facebook).
      const host = document.createElement("div");
      host.style.cssText = "position:fixed;inset:0;z-index:2147483647;";
      const root = host.attachShadow({ mode: "open" });
      root.innerHTML = `
        <style>
          .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45);
            display: flex; align-items: center; justify-content: center;
            font: 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
          form { color-scheme: light dark; background: #fff; color: #1a1a1a; border-radius: 10px; padding: 16px;
            width: 320px; max-width: calc(100vw - 32px); box-shadow: 0 10px 30px rgba(0,0,0,0.25);
            display: flex; flex-direction: column; gap: 10px; }
          .title { font-weight: 700; font-size: 15px; }
          label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #555; }
          input { font: inherit; padding: 6px 8px; border: 1px solid #ccc; border-radius: 6px;
            color: #1a1a1a; background: #fff; }
          .preview { font-size: 11px; color: #555; font-style: italic; word-break: break-all; }
          .note { font-size: 11px; color: #777; }
          .actions { display: flex; justify-content: flex-end; gap: 8px; }
          button { font: inherit; padding: 6px 12px; border-radius: 6px; border: 1px solid #ccc;
            background: #fff; color: #1a1a1a; cursor: pointer; }
          button.ok { background: #16a34a; border-color: #16a34a; color: #fff; }
          @media (prefers-color-scheme: dark) {
            form { background: #242526; color: #e4e6eb; }
            label, .preview { color: #b0b3b8; }
            .note { color: #8a8d91; }
            input, button { background: #3a3b3c; color: #e4e6eb; border-color: #4e4f50; color-scheme: dark; }
            button.ok { background: #16a34a; border-color: #16a34a; color: #fff; }
          }
        </style>
        <div class="overlay">
          <form>
            <div class="title"></div>
            <label>Name (Save as)<input name="name" type="text" placeholder="Pick or type…" autocomplete="off" /></label>
            <label>Date<input name="date" type="date" /></label>
            <div class="preview"></div>
            <div class="note"></div>
            <div class="actions">
              <button type="button" class="cancel">Cancel</button>
              <button type="submit" class="ok">Download</button>
            </div>
          </form>
        </div>`;

      const form = root.querySelector("form");
      const nameInput = root.querySelector('input[name="name"]');
      const dateInput = root.querySelector('input[name="date"]');
      const preview = root.querySelector(".preview");
      root.querySelector(".title").textContent = `Download ${photoSrcs.length} photo(s)`;
      attachPresetDropdown(nameInput); // from shared.js
      root.querySelector(".note").textContent = destPath
        ? `Saves to: ${destPath.join(" / ")} (falls back to Downloads if Chrome no longer allows that folder).`
        : "Saves to your Downloads folder. Pick a folder in the side panel to save there instead.";
      nameInput.value = savedName;
      dateInput.value = savedDate;

      const updatePreview = () => {
        const base = buildBaseName(nameInput.value, dateInput.value); // from shared.js
        preview.textContent = `e.g. "${filenameFor(photoSrcs[0], 1, base)}"`;
      };
      updatePreview();
      nameInput.addEventListener("input", updatePreview);
      dateInput.addEventListener("input", updatePreview);

      const finish = (result) => {
        host.remove();
        resolve(result);
      };
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        finish({ name: nameInput.value, date: dateInput.value });
      });
      root.querySelector(".cancel").addEventListener("click", () => finish(null));
      root.querySelector(".overlay").addEventListener("click", (e) => {
        if (e.target === e.currentTarget) finish(null); // click outside the form
      });
      // Keep typing in the form from triggering Messenger's keyboard shortcuts.
      ["keydown", "keyup", "keypress"].forEach((type) =>
        root.addEventListener(type, (e) => {
          e.stopPropagation();
          if (type === "keydown" && e.key === "Escape") finish(null);
        })
      );

      document.body.appendChild(host);
      nameInput.focus({ preventScroll: true });
      // Pre-selected: Enter keeps the remembered name, typing replaces it.
      nameInput.select();
    });
  }

  function downloadIcon(width, height) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", String(width || 20));
    svg.setAttribute("height", String(height || 20));
    svg.setAttribute("fill", "currentColor");
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", "M12 3a1 1 0 0 1 1 1v9.59l3.3-3.3a1 1 0 1 1 1.4 1.42l-5 5a1 1 0 0 1-1.4 0l-5-5a1 1 0 1 1 1.4-1.42l3.3 3.3V4a1 1 0 0 1 1-1zM5 19a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H6a1 1 0 0 1-1-1z");
    svg.appendChild(path);
    return svg;
  }

  // Copies the menu's last item (so it matches Messenger's look) and turns
  // the copy into "Download photos". The copy isn't wired into Messenger's
  // own click handling, so only our listener runs.
  function addDownloadItem(menu, photos) {
    const items = menu.querySelectorAll('[role="menuitem"]');
    const last = items[items.length - 1];
    if (!last) return;

    // Clone the item's wrapper too if each item sits in its own wrapper.
    let unit = last;
    while (unit.parentElement && unit.parentElement !== menu && unit.parentElement.children.length === 1) {
      unit = unit.parentElement;
    }
    const clone = unit.cloneNode(true);
    clone.setAttribute(INJECTED_ATTR, "1");
    const item = clone.matches('[role="menuitem"]') ? clone : clone.querySelector('[role="menuitem"]');
    if (!item) return;
    item.setAttribute("aria-label", "Download photos");

    // Replace the label text.
    const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
    let first = true;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.nodeValue.trim()) continue;
      node.nodeValue = first ? `Download photos (${photos.length})` : "";
      first = false;
    }

    // Swap the copied icon (e.g. Report's flag) for a download arrow.
    const icon = clone.querySelector("svg, i");
    const originalIcon = unit.querySelector("svg, i");
    if (icon && originalIcon) {
      const box = originalIcon.getBoundingClientRect();
      icon.replaceWith(downloadIcon(Math.round(box.width), Math.round(box.height)));
    }

    item.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (releaseScroll) releaseScroll();
      const release = holdChatScroll(photos[0]);
      releaseScroll = release;
      // When no download starts, there's no "done" message: release after
      // Messenger's own scrolling would have finished.
      const releaseSoon = () => {
        if (releaseScroll === release) releaseScroll = null;
        setTimeout(release, HOLD_AFTER_DONE_MS);
      };
      closeMenu(menu);
      const payload = photos.map((img) => ({
        src: img.currentSrc || img.src,
        width: img.naturalWidth,
        height: img.naturalHeight,
        alt: img.alt || "",
      }));
      const BUSY_TEXT = "A download is already running. Try again when it finishes.";

      // Side panel open: it downloads with its own name, date and folder.
      // No answer (the send fails) means the side panel is closed.
      if (!extensionAlive()) {
        releaseSoon();
        showToast("The extension was updated. Refresh this page (F5), then try again.");
        return;
      }
      const response = await sendSafe({ type: "DOWNLOAD_MESSAGE_PHOTOS", photos: payload });
      if (response && response.ok) {
        showToast(`Downloading ${payload.length} photo(s)… check the side panel.`);
        return;
      }
      if (response && response.reason === "busy") {
        releaseSoon();
        showToast(BUSY_TEXT);
        return;
      }

      // Side panel closed: ask for the name and date here instead.
      const answer = await askNameAndDate(payload.map((p) => p.src));
      if (!answer) {
        releaseSoon();
        return;
      }
      try {
        chrome.storage.local.set({ filenamePrefix: answer.name, filenameDate: answer.date }).catch(() => {});
      } catch (err) {
        // Extension context invalidated; sendSafe below reports it.
      }
      const quick = await sendSafe({
        type: "QUICK_DOWNLOAD_PHOTOS",
        photos: payload,
        name: answer.name,
        date: answer.date,
      });
      if (quick && quick.ok) {
        showToast(`Downloading ${payload.length} photo(s)…`);
      } else {
        releaseSoon();
        showToast(quick && quick.reason === "busy" ? BUSY_TEXT : "Couldn't start the download. Try reloading the page.");
      }
    });

    unit.parentElement.insertBefore(clone, unit.nextSibling);
  }

  function checkForMenu() {
    const trigger = document.querySelector('[aria-haspopup="menu"][aria-expanded="true"]');
    if (!trigger) return;
    // Innermost menu that actually holds the items; Messenger can render more
    // than one, so prefer the one that has keyboard focus (the visible one).
    const candidates = Array.from(document.querySelectorAll('[role="menu"]')).filter(
      (m) => !m.querySelector('[role="menu"]') && m.querySelector('[role="menuitem"]')
    );
    const menu =
      candidates.find((m) => m.contains(document.activeElement)) || candidates[candidates.length - 1];
    if (!menu || menu.querySelector(`[${INJECTED_ATTR}]`)) return;
    const photos = photosForTrigger(trigger);
    if (photos.length) addDownloadItem(menu, photos);
  }

  // Messenger changes the page constantly; check at most once per frame.
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      checkForMenu();
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
