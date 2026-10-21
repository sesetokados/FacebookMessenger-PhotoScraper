// Hidden extension page that background.js opens to save a Messenger menu
// download into the folder chosen in the side panel while the panel is
// closed. Folder handles can only be used from an extension page like this
// one, not from the background service worker.

// Same IndexedDB store the side panel uses to remember the main folder.
const HANDLE_DB_NAME = "page-image-picker-fs";
const HANDLE_STORE_NAME = "handles";
const HANDLE_KEY = "mainDir";

function loadMainDirHandle() {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(HANDLE_DB_NAME, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(HANDLE_STORE_NAME);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction(HANDLE_STORE_NAME, "readonly");
      const req = tx.objectStore(HANDLE_STORE_NAME).get(HANDLE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    };
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "OFFSCREEN_SAVE_TO_FOLDER") return;
  saveToChosenFolder(msg).then(sendResponse, (err) => {
    console.error("Saving to the chosen folder failed:", err);
    sendResponse({ ok: false, reason: "error" });
  });
  return true; // responds asynchronously
});

// Returns { ok: true, done, failed, folder } or { ok: false, reason } where
// reason is "permission" (Chrome no longer allows writing to the folder),
// "missing" (the folder was moved/renamed/deleted) or "error".
async function saveToChosenFolder({ urls, name, date, destPath }) {
  const main = await loadMainDirHandle();
  if (!main || main.name !== destPath[0]) return { ok: false, reason: "missing" };

  // Can't ask for permission from a hidden page; it has to still be granted.
  if ((await main.queryPermission({ mode: "readwrite" })) !== "granted") {
    return { ok: false, reason: "permission" };
  }

  let dir = main;
  for (const part of destPath.slice(1)) {
    try {
      dir = await dir.getDirectoryHandle(part);
    } catch (err) {
      return { ok: false, reason: "missing" };
    }
  }

  // Same naming as the side panel: continue after the highest existing number.
  const existing = [];
  for await (const [entryName, handle] of dir.entries()) {
    if (handle.kind === "file") existing.push(entryName);
  }
  const base = buildBaseName(name, date);
  const taken = new Set(existing.map((n) => n.toLowerCase()));
  let next = base ? maxNumberForBase(existing, base) + 1 : 1;
  const filenames = urls.map((url) => {
    const filename = makeUnique(filenameFor(url, next++, base), taken);
    taken.add(filename.toLowerCase());
    return filename;
  });

  let done = 0;
  let failed = 0;
  await runWithConcurrency(urls.length, DOWNLOAD_CONCURRENCY, async (i) => {
    try {
      const resp = await fetch(urls[i]);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const fileHandle = await dir.getFileHandle(filenames[i], { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      done++;
    } catch (err) {
      console.error("Failed to save:", urls[i], err);
      failed++;
    }
  });
  return { ok: true, done, failed, folder: destPath.join(" / ") };
}
