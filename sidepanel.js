const listEl = document.getElementById("list");
const emptyEl = document.getElementById("empty");
const statusEl = document.getElementById("status");
const countEl = document.getElementById("count");
const rescanBtn = document.getElementById("rescanBtn");
const selectAllBtn = document.getElementById("selectAllBtn");
const selectNoneBtn = document.getElementById("selectNoneBtn");
const downloadBtn = document.getElementById("downloadBtn");
const minWidthInput = document.getElementById("minWidth");
const minHeightInput = document.getElementById("minHeight");
const applyFilterBtn = document.getElementById("applyFilterBtn");
const clearFilterBtn = document.getElementById("clearFilterBtn");
const accumulateCheckbox = document.getElementById("accumulate");
const resetBtn = document.getElementById("resetBtn");
const filenamePrefixInput = document.getElementById("filenamePrefix");
const filenameDateInput = document.getElementById("filenameDate");
const namingPreview = document.getElementById("namingPreview");
const scrollAmountInput = document.getElementById("scrollAmount");
const scanIntervalInput = document.getElementById("scanInterval");
const autoScanBtn = document.getElementById("autoScanBtn");
const scanStopDateInput = document.getElementById("scanStopDate");
const scanTrackerEl = document.getElementById("scanTracker");
const settingsBtn = document.getElementById("settingsBtn");
const settingsPanel = document.getElementById("settingsPanel");
const showAutoScanCheckbox = document.getElementById("showAutoScan");
const messengerFullQualityCheckbox = document.getElementById("messengerFullQuality");
const groupBySenderCheckbox = document.getElementById("groupBySender");
const messengerBackgroundTabCheckbox = document.getElementById("messengerBackgroundTab");
const autoScanBar = document.getElementById("autoScanBar");
const hoverColorPicker = document.getElementById("hoverColorPicker");
const chooseMainFolderBtn = document.getElementById("chooseMainFolderBtn");
const mainFolderNameEl = document.getElementById("mainFolderName");
const rescanFoldersBtn = document.getElementById("rescanFoldersBtn");
const folderScanStatusEl = document.getElementById("folderScanStatus");
const scanProgressEl = document.getElementById("scanProgress");
const scanProgressTextEl = document.getElementById("scanProgressText");
const destFolderTreeWrap = document.getElementById("destFolderTreeWrap");
const destFolderTreeEl = document.getElementById("destFolderTree");
const folderSearchInput = document.getElementById("folderSearchInput");
const selectedDestLabelEl = document.getElementById("selectedDestLabel");
const folderSettingsSummaryStatusEl = document.getElementById("folderSettingsSummaryStatus");
const selectFolderNoneBtn = document.getElementById("selectFolderNoneBtn");
const completionOverlay = document.getElementById("completionOverlay");
const completionTitleEl = document.getElementById("completionTitle");
const completionBodyEl = document.getElementById("completionBody");
const completionErrorsListEl = document.getElementById("completionErrorsList");
const viewErrorsBtn = document.getElementById("viewErrorsBtn");
const completionOkBtn = document.getElementById("completionOkBtn");
const appShell = document.getElementById("appShell");
const photosToggle = document.getElementById("photosToggle");
const photosToggleArrow = document.getElementById("photosToggleArrow");
const photosToggleCount = document.getElementById("photosToggleCount");
const downloadProgressEl = document.getElementById("downloadProgress");
const downloadProgressFill = document.getElementById("downloadProgressFill");
const downloadProgressText = document.getElementById("downloadProgressText");
const confirmOverlay = document.getElementById("confirmOverlay");
const confirmBodyEl = document.getElementById("confirmBody");
const confirmCancelBtn = document.getElementById("confirmCancelBtn");
const confirmProceedBtn = document.getElementById("confirmProceedBtn");

let currentImages = []; // [{src, previewSrc, sourceType, width, height, order, index}]
// Folder-routing feature: pick a "main" folder (e.g. NIVI) once via the native
// folder picker, then recursively scan its ENTIRE subtree (any depth) and show
// it as an expandable tree. The user can select any folder at any depth as the
// save destination. destDirHandle === null means "use the original
// chrome.downloads flow" (saves to the browser's Downloads folder), which is
// left completely intact.
let mainDirHandle = null; // FileSystemDirectoryHandle for the chosen main folder
let folderTree = null; // { name, handle, path: [names...], children: [...] } recursively scanned
let destDirHandle = null; // FileSystemDirectoryHandle for the chosen destination folder, or null
let destDirPath = null; // display path array for the chosen destination, e.g. ["NIVI","STORE A","AUGUST 25"]
let pendingReconnectHandle = null; // a remembered handle whose permission needs re-confirming
const expandedPaths = new Set(); // path-strings ("NIVI/STORE A") the user has expanded in the tree
let minWidthFilter = 0;
let minHeightFilter = 0;
let lastClickedIndex = null; // index into the *visible* array, for shift-click range select
let orderCounter = 0; // stable display position, only grows in accumulate mode
let autoScanRunning = false; // true while "Scan chat" is running
let autoScanTimer = null; // pending timeout for the next "Scan chat" step
let autoScanGeneration = 0; // bumped on stop/reset to cancel any in-flight tick

async function loadSavedFilter() {
  try {
    const saved = await chrome.storage.local.get([
      "minWidthFilter",
      "minHeightFilter",
      "accumulate",
      "showAutoScan",
      "hoverHighlightColor",
      "messengerFullQuality",
      "groupBySender",
      "messengerBackgroundTab",
      "filenameDate",
      "photosCollapsed",
      "scanStopDate",
      "filenamePrefix",
    ]);
    if (typeof saved.scanStopDate === "string") scanStopDateInput.value = saved.scanStopDate;
    // "Save as" is sticky like the date: kept between downloads and shared
    // with the Messenger "Download photos" form.
    if (typeof saved.filenamePrefix === "string") {
      filenamePrefixInput.value = saved.filenamePrefix;
      updateNamingPreview();
    }
    if (typeof saved.minWidthFilter === "number") {
      minWidthFilter = saved.minWidthFilter;
      minWidthInput.value = minWidthFilter || "";
    }
    if (typeof saved.minHeightFilter === "number") {
      minHeightFilter = saved.minHeightFilter;
      minHeightInput.value = minHeightFilter || "";
    }
    if (typeof saved.accumulate === "boolean") {
      accumulateCheckbox.checked = saved.accumulate;
    }
    // "Scan chat" is hidden by default; only show it if the user has
    // enabled it before via Settings.
    const showAutoScan = saved.showAutoScan === true;
    showAutoScanCheckbox.checked = showAutoScan;
    autoScanBar.style.display = showAutoScan ? "flex" : "none";

    // Off by default; the user has to turn it on in Settings.
    messengerFullQualityCheckbox.checked = saved.messengerFullQuality === true;
    groupBySenderCheckbox.checked = saved.groupBySender === true;
    messengerBackgroundTabCheckbox.checked = saved.messengerBackgroundTab === true;
    setPhotosCollapsed(saved.photosCollapsed === true);
    // The date is shared with the Messenger "Download photos" form and kept
    // between downloads; the "Save as" name is not.
    if (typeof saved.filenameDate === "string") {
      filenameDateInput.value = saved.filenameDate;
      updateNamingPreview();
    }

    const hoverColor = saved.hoverHighlightColor || "#1e3a8a";
    hoverColorPicker.value = hoverColor;
    document.documentElement.style.setProperty("--hover-highlight", hoverColor);
  } catch (err) {
    console.error("Couldn't load saved filter:", err);
  }
}

function saveFilter() {
  chrome.storage.local.set({ minWidthFilter, minHeightFilter }).catch((err) => {
    console.error("Couldn't save filter:", err);
  });
}

function setStatus(text) {
  statusEl.textContent = text || "";
}

// --- Destination folder picker -------------------------------------------
// FileSystemDirectoryHandle objects are structured-cloneable, so we can
// stash the chosen "main folder" handle in IndexedDB and try to reuse it
// next time the panel opens, instead of making the user re-pick every time.
const HANDLE_DB_NAME = "page-image-picker-fs";
const HANDLE_STORE_NAME = "handles";
const HANDLE_KEY = "mainDir";

function openHandleDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(HANDLE_DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(HANDLE_STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveMainDirHandle(handle) {
  try {
    const db = await openHandleDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE_NAME, "readwrite");
      tx.objectStore(HANDLE_STORE_NAME).put(handle, HANDLE_KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error("Couldn't remember the chosen folder:", err);
  }
}

async function loadMainDirHandle() {
  try {
    const db = await openHandleDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE_NAME, "readonly");
      const req = tx.objectStore(HANDLE_STORE_NAME).get(HANDLE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error("Couldn't load the remembered folder:", err);
    return null;
  }
}

// Recursively walks the ENTIRE subtree under `handle`, at any depth, building
// a tree of { name, handle, path, children }. Only directories become nodes;
// files are just tallied into scanStats so huge photo counts don't bloat the
// tree or slow down rendering. Read-only — never creates or writes anything.
const scanStats = { folders: 0, files: 0 };

async function scanDirRecursive(handle, path) {
  const node = { name: handle.name, handle, path, children: [] };
  for await (const [name, childHandle] of handle.entries()) {
    if (childHandle.kind === "directory") {
      scanStats.folders++;
      // Update live counters every few folders rather than on every single
      // one, so a tree with hundreds of folders doesn't thrash the DOM.
      if (scanStats.folders % 4 === 0) updateScanProgressText();
      const childNode = await scanDirRecursive(childHandle, [...path, name]);
      node.children.push(childNode);
    } else {
      scanStats.files++;
    }
  }
  node.children.sort((a, b) => a.name.localeCompare(b.name));
  return node;
}

function updateScanProgressText() {
  scanProgressTextEl.textContent = `Folders scanned: ${scanStats.folders}  •  Files found: ${scanStats.files}`;
}

// Scans mainDirHandle's entire subtree (any number of levels) and rebuilds
// the tree view. There's no way to know the total folder/file count before
// finishing a full recursive scan, so the progress bar is an indeterminate
// "still working" animation paired with live counts, not a real percentage.
async function scanMainFolder() {
  if (!mainDirHandle) return;
  mainFolderNameEl.textContent = mainDirHandle.name;
  rescanFoldersBtn.style.display = "inline-block";
  destDirHandle = null;
  destDirPath = null;
  updateSelectedDestLabel();
  expandedPaths.clear();
  expandedPaths.add(mainDirHandle.name);
  folderSearchInput.value = "";

  scanStats.folders = 0;
  scanStats.files = 0;
  scanProgressEl.style.display = "block";
  updateScanProgressText();
  folderScanStatusEl.textContent = "";
  destFolderTreeWrap.style.display = "none";

  try {
    folderTree = await scanDirRecursive(mainDirHandle, [mainDirHandle.name]);
    scanProgressEl.style.display = "none";
    folderScanStatusEl.textContent = `✓ Scan complete — ${scanStats.folders} folder(s), ${scanStats.files} file(s) found`;
    destFolderTreeWrap.style.display = "block";
    renderFolderTree();
    updateFolderSettingsSummary();
    await restoreDestPath();
  } catch (err) {
    console.error(err);
    scanProgressEl.style.display = "none";
    folderScanStatusEl.textContent =
      "Couldn't read that folder (it may have been moved, deleted, or permission was revoked).";
  }
}

function nodeMatchesSearch(node, term) {
  if (!term) return true;
  if (node.name.toLowerCase().includes(term)) return true;
  return node.children.some((c) => nodeMatchesSearch(c, term));
}

function highlightMatch(name, term) {
  if (!term) return document.createTextNode(name);
  const idx = name.toLowerCase().indexOf(term);
  if (idx === -1) return document.createTextNode(name);
  const frag = document.createDocumentFragment();
  frag.appendChild(document.createTextNode(name.slice(0, idx)));
  const mark = document.createElement("mark");
  mark.textContent = name.slice(idx, idx + term.length);
  frag.appendChild(mark);
  frag.appendChild(document.createTextNode(name.slice(idx + term.length)));
  return frag;
}

function renderTreeNode(node, container, term) {
  if (!nodeMatchesSearch(node, term)) return;

  const pathStr = node.path.join("/");
  const hasChildren = node.children.length > 0;
  const isExpanded = term ? true : expandedPaths.has(pathStr) || node.path.length === 1;

  const row = document.createElement("div");
  row.className = "tree-row" + (destDirHandle === node.handle ? " selected" : "");

  const toggle = document.createElement("button");
  toggle.className = "tree-toggle";
  toggle.type = "button";
  toggle.textContent = hasChildren ? (isExpanded ? "▾" : "▸") : "";
  toggle.disabled = !hasChildren;
  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!hasChildren) return;
    if (expandedPaths.has(pathStr)) expandedPaths.delete(pathStr);
    else expandedPaths.add(pathStr);
    renderFolderTree();
  });

  const nameSpan = document.createElement("span");
  nameSpan.className = "tree-name";
  nameSpan.textContent = "📁 ";
  nameSpan.appendChild(highlightMatch(node.name, term));

  row.appendChild(toggle);
  row.appendChild(nameSpan);
  row.addEventListener("click", () => {
    destDirHandle = node.handle;
    destDirPath = node.path;
    saveDestPath(node.path);
    updateSelectedDestLabel();
    renderFolderTree();
  });

  container.appendChild(row);

  if (hasChildren && isExpanded) {
    const childrenEl = document.createElement("div");
    childrenEl.className = "tree-children";
    node.children.forEach((child) => renderTreeNode(child, childrenEl, term));
    container.appendChild(childrenEl);
  }
}

function renderFolderTree() {
  destFolderTreeEl.innerHTML = "";
  if (!folderTree) return;
  const term = folderSearchInput.value.trim().toLowerCase();
  renderTreeNode(folderTree, destFolderTreeEl, term);
  if (term && !destFolderTreeEl.children.length) {
    const none = document.createElement("div");
    none.style.padding = "6px 2px";
    none.style.color = "var(--muted)";
    none.textContent = `No folders match "${folderSearchInput.value.trim()}".`;
    destFolderTreeEl.appendChild(none);
  }
}

function updateSelectedDestLabel() {
  selectedDestLabelEl.textContent = destDirPath
    ? `Saving to: ${destDirPath.join(" / ")}`
    : "Saving to: Downloads (default)";
  updateFolderSettingsSummary();
}

// Keeps the collapsed "📁 Folder Settings" summary line useful even while
// the section is closed, so the user doesn't have to open it just to see
// where photos are currently headed.
function updateFolderSettingsSummary() {
  if (!mainDirHandle) {
    folderSettingsSummaryStatusEl.textContent = "Photos save to Downloads";
  } else if (destDirPath) {
    const shortPath =
      destDirPath.length > 2
        ? `…/${destDirPath.slice(-2).join("/")}`
        : destDirPath.join("/");
    folderSettingsSummaryStatusEl.textContent = `Saving to ${shortPath}`;
  } else {
    folderSettingsSummaryStatusEl.textContent = `${mainDirHandle.name} — ${scanStats.folders} folder(s) scanned`;
  }
}

folderSearchInput.addEventListener("input", renderFolderTree);

async function initFolderPicker() {
  if (!window.showDirectoryPicker) {
    mainFolderNameEl.textContent =
      "Folder saving needs a newer Chrome (File System Access API not available).";
    chooseMainFolderBtn.disabled = true;
    return;
  }
  const handle = await loadMainDirHandle();
  if (!handle) return;
  try {
    const perm = await handle.queryPermission({ mode: "readwrite" });
    if (perm === "granted") {
      mainDirHandle = handle;
      await scanMainFolder();
    } else {
      pendingReconnectHandle = handle;
      mainFolderNameEl.textContent = `${handle.name} (click "Reconnect folder" to resume)`;
      chooseMainFolderBtn.textContent = "Reconnect folder";
      folderSettingsSummaryStatusEl.textContent = `${handle.name} — click to reconnect`;
    }
  } catch (err) {
    console.error(err);
  }
}

chooseMainFolderBtn.addEventListener("click", async () => {
  if (!window.showDirectoryPicker) return;

  // A previously-remembered folder just needs permission re-confirmed —
  // re-requesting it (rather than opening a fresh picker) keeps pointing
  // at the same folder the user picked before.
  if (pendingReconnectHandle) {
    try {
      const perm = await pendingReconnectHandle.requestPermission({ mode: "readwrite" });
      if (perm === "granted") {
        mainDirHandle = pendingReconnectHandle;
        pendingReconnectHandle = null;
        chooseMainFolderBtn.textContent = "Choose main folder…";
        await scanMainFolder();
        return;
      }
      folderScanStatusEl.textContent = "Permission denied. Choose the folder again.";
    } catch (err) {
      console.error(err);
    }
  }

  try {
    const handle = await window.showDirectoryPicker();
    mainDirHandle = handle;
    pendingReconnectHandle = null;
    chooseMainFolderBtn.textContent = "Choose main folder…";
    await saveMainDirHandle(handle);
    await scanMainFolder();
  } catch (err) {
    if (err && err.name === "AbortError") return; // user closed the dialog
    console.error(err);
    folderScanStatusEl.textContent = "Couldn't open that folder.";
  }
});

rescanFoldersBtn.addEventListener("click", scanMainFolder);

selectFolderNoneBtn.addEventListener("click", () => {
  destDirHandle = null;
  destDirPath = null;
  saveDestPath(null);
  updateSelectedDestLabel();
  renderFolderTree();
});

// The chosen destination is remembered as a path of folder names (e.g.
// ["NIVI", "STORE A", "AUGUST 25"]) so it's still selected next time the panel
// opens, and so a Messenger menu download can save there with the panel closed.
function saveDestPath(path) {
  chrome.storage.local.set({ destPath: path || null }).catch((err) => {
    console.error("Couldn't remember the destination folder:", err);
  });
}

function findTreeNode(node, path) {
  if (!node || node.name !== path[0]) return null;
  if (path.length === 1) return node;
  for (const child of node.children) {
    const found = findTreeNode(child, path.slice(1));
    if (found) return found;
  }
  return null;
}

// --- New folder ------------------------------------------------------------------
// Creates a subfolder inside the currently selected destination (or inside
// the main folder when none is selected), adds it to the tree and selects it.
const newFolderBtn = document.getElementById("newFolderBtn");
const newFolderForm = document.getElementById("newFolderForm");
const newFolderNameInput = document.getElementById("newFolderName");
const newFolderParentLabel = document.getElementById("newFolderParentLabel");
const newFolderCancelBtn = document.getElementById("newFolderCancelBtn");
const newFolderStatus = document.getElementById("newFolderStatus");

function newFolderParentNode() {
  return (destDirPath && findTreeNode(folderTree, destDirPath)) || folderTree;
}

function showNewFolderForm(show) {
  newFolderForm.style.display = show ? "flex" : "none";
  newFolderBtn.style.display = show ? "none" : "inline-block";
  if (show) {
    newFolderParentLabel.textContent = `Inside: ${newFolderParentNode().path.join(" / ")}`;
    newFolderNameInput.value = "";
    newFolderStatus.textContent = "";
    newFolderNameInput.focus();
  }
}

newFolderBtn.addEventListener("click", () => {
  if (folderTree) showNewFolderForm(true);
});
newFolderCancelBtn.addEventListener("click", () => showNewFolderForm(false));
newFolderNameInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape") showNewFolderForm(false);
});

newFolderForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = sanitizeForFilename(newFolderNameInput.value); // from shared.js
  if (!name) {
    newFolderStatus.textContent = "Type a folder name first.";
    return;
  }
  const parent = newFolderParentNode();
  try {
    // Returns the existing folder if one with this name is already there.
    const handle = await parent.handle.getDirectoryHandle(name, { create: true });
    let node = parent.children.find((c) => c.name.toLowerCase() === name.toLowerCase());
    const existed = !!node;
    if (!node) {
      node = { name: handle.name, handle, path: [...parent.path, handle.name], children: [] };
      parent.children.push(node);
      parent.children.sort((a, b) => a.name.localeCompare(b.name));
      scanStats.folders++;
    }

    // Select it and make sure it's visible in the tree.
    destDirHandle = node.handle;
    destDirPath = node.path;
    saveDestPath(node.path);
    for (let i = 1; i < node.path.length; i++) expandedPaths.add(node.path.slice(0, i).join("/"));
    folderSearchInput.value = "";
    showNewFolderForm(false);
    newFolderStatus.textContent = existed
      ? `"${node.name}" already exists — selected it.`
      : `Created "${node.name}" and selected it.`;
    updateSelectedDestLabel();
    renderFolderTree();
  } catch (err) {
    console.error("Couldn't create folder:", err);
    newFolderStatus.textContent =
      "Couldn't create the folder (permission may have been revoked — try Rescan folders or Reconnect).";
  }
});

// After a folder scan, re-select the remembered destination if it still exists.
async function restoreDestPath() {
  try {
    const { destPath } = await chrome.storage.local.get("destPath");
    if (!Array.isArray(destPath) || !destPath.length) return;
    const node = findTreeNode(folderTree, destPath);
    if (!node) {
      // Gone (or a different main folder was picked): forget it so Messenger
      // menu downloads don't keep aiming at a folder that isn't there.
      saveDestPath(null);
      return;
    }
    destDirHandle = node.handle;
    destDirPath = node.path;
    // Expand the tree down to it so the selection is visible.
    for (let i = 1; i < node.path.length; i++) expandedPaths.add(node.path.slice(0, i).join("/"));
    updateSelectedDestLabel();
    renderFolderTree();
  } catch (err) {
    console.error("Couldn't restore the destination folder:", err);
  }
}

// --- Completion modal ------------------------------------------------------
function showCompletionModal({ succeeded, failed, destinationLabel, errors, lowQualityCount = 0 }) {
  const total = succeeded + failed;
  if (failed === 0) {
    completionTitleEl.textContent = "✓ Download Complete";
    completionTitleEl.className = "success";
  } else {
    completionTitleEl.textContent = "⚠ Download Completed With Errors";
    completionTitleEl.className = "error";
  }

  const lines = [];
  if (failed === 0) {
    lines.push(`Total Photos: ${total}`);
  } else {
    lines.push(`Successfully Saved: ${succeeded} photo(s)`);
    lines.push(`Failed: ${failed} photo(s)`);
  }
  if (lowQualityCount) {
    lines.push(`Low quality (couldn't open full size): ${lowQualityCount} photo(s)`);
  }
  lines.push(`Saved To: ${destinationLabel}`);
  completionBodyEl.textContent = lines.join("\n");

  completionErrorsListEl.style.display = "none";
  completionErrorsListEl.innerHTML = "";
  if (errors && errors.length) {
    viewErrorsBtn.style.display = "inline-block";
    errors.forEach((e) => {
      const line = document.createElement("div");
      line.textContent = e;
      completionErrorsListEl.appendChild(line);
    });
  } else {
    viewErrorsBtn.style.display = "none";
  }

  completionOverlay.style.display = "flex";
}

viewErrorsBtn.addEventListener("click", () => {
  completionErrorsListEl.style.display =
    completionErrorsListEl.style.display === "none" ? "block" : "none";
});

completionOkBtn.addEventListener("click", () => {
  completionOverlay.style.display = "none";
});

// --- Missing-name warning --------------------------------------------------
let resolveConfirm = null;

function closeConfirm(result) {
  confirmOverlay.style.display = "none";
  if (resolveConfirm) {
    const resolve = resolveConfirm;
    resolveConfirm = null;
    resolve(result);
  }
}

// Resolves true right away if both "Save as" and date are filled in;
// otherwise asks the user before downloading with an incomplete name.
function confirmMissingNaming(firstItem) {
  const missing = [];
  if (!sanitizeForFilename(filenamePrefixInput.value)) missing.push('"Save as" name');
  if (!filenameDateInput.value) missing.push("date");
  if (!missing.length) return Promise.resolve(true);

  confirmBodyEl.textContent =
    `No ${missing.join(" or ")} set.\n` +
    `Photos will be named like "${filenameFromSrc(firstItem.src, 1)}".`;
  confirmOverlay.style.display = "flex";
  return new Promise((resolve) => {
    resolveConfirm = resolve;
  });
}

confirmCancelBtn.addEventListener("click", () => closeConfirm(false));
confirmProceedBtn.addEventListener("click", () => closeConfirm(true));

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// This function is injected into the page. It must be self-contained.
// Finds the chat's actual scrollable container (not just the whole page —
// Messenger scrolls an inner <div>) and scrolls it up by `amount`, toward
// older messages.
function scrollPageUp(amount) {
  function isScrollable(el) {
    const style = getComputedStyle(el);
    const canScroll = style.overflowY === "auto" || style.overflowY === "scroll";
    return canScroll && el.scrollHeight > el.clientHeight + 40;
  }

  function findScrollable() {
    // Best guess: the nearest scrollable ancestor of a chat photo.
    const photo = Array.from(document.images)
      .reverse()
      .find((img) => (img.currentSrc || img.src).includes("fbcdn.net") && img.getBoundingClientRect().width >= 60);
    for (let el = photo && photo.parentElement; el && el !== document.body; el = el.parentElement) {
      if (isScrollable(el)) return el;
    }
    // Otherwise the largest scrollable area on the page.
    let best = null;
    let bestArea = 0;
    for (const el of document.querySelectorAll("*")) {
      if (isScrollable(el)) {
        const area = el.clientWidth * el.clientHeight;
        if (area > bestArea) {
          bestArea = area;
          best = el;
        }
      }
    }
    return best || document.scrollingElement || document.documentElement;
  }

  const el = findScrollable();
  el.scrollTop -= amount;
  return {
    scrollTop: el.scrollTop,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
    atTop: el.scrollTop <= 5,
  };
}

// This function is injected into the page. It must be self-contained
// (no references to outer scope) since it runs in the page's context.
function scanImagesInPage() {
  const IMG_EXT_RE = /\.(jpe?g|png|gif|webp|avif|bmp|svg)(\?|#|$)/i;
  // Attributes lazy-loading libraries commonly use to hide the real
  // full-resolution URL until the image scrolls into view.
  const FULL_RES_ATTRS = [
    "data-src",
    "data-original",
    "data-full",
    "data-large",
    "data-full-src",
    "data-zoom-src",
    "data-lazy-src",
    "data-hi-res-src",
  ];

  function bestFromSrcset(srcset) {
    if (!srcset) return null;
    // srcset looks like: "url1 320w, url2 768w, url3 1200w"
    const candidates = srcset
      .split(",")
      .map((entry) => entry.trim().split(/\s+/))
      .map(([url, size]) => ({
        url,
        width: size && size.endsWith("w") ? parseInt(size, 10) : 0,
      }))
      .filter((c) => c.url);
    if (!candidates.length) return null;
    candidates.sort((a, b) => b.width - a.width);
    return candidates[0].url;
  }

  // Messenger: who sent each photo and when. Sender and time come from the
  // message's accessibility labels ("At 10:20 AM, Katrina: ..." or "Enter,
  // Message sent 10:20 AM by Katrina"); the date comes from the chat's date
  // separators ("Yesterday at 3:00 PM", "Oct 18, 2026, 7:05 AM", ...).
  const isMessenger = /(^|\.)(facebook|messenger)\.com$/.test(location.hostname);
  const AT_RE = /^At (.+?\d ?[ap]m), (.+?):/i;
  const SENT_RE = /message sent (.*?\d ?[ap]m) by (.+?)(?::|$)/i;
  const normalizeSpaces = (t) => (t || "").replace(/[  ]/g, " ");

  function infoFromLabel(label) {
    const text = normalizeSpaces(label);
    const m = text.match(AT_RE) || text.match(SENT_RE);
    return m ? { stamp: m[1].trim(), sender: m[2].trim() } : null;
  }

  function messageInfoOf(img) {
    for (let el = img.parentElement, depth = 0; el && depth < 25; el = el.parentElement, depth++) {
      const own = infoFromLabel(el.getAttribute("aria-label"));
      if (own) return own;
      if (el.getAttribute("role") === "article" || el.getAttribute("role") === "row") {
        // The labelled element may be a sibling of the photo inside the message row.
        for (const labelled of el.querySelectorAll("[aria-label]")) {
          const info = infoFromLabel(labelled.getAttribute("aria-label"));
          if (info) return info;
        }
        return null;
      }
    }
    return null;
  }

  // Same stamp parser as Messenger Report Exporter. Returns { date: "YYYY-MM-DD"
  // or null, time: "10:20 AM" or null }, or null when the text isn't a stamp.
  const now = new Date();
  const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const TIME = "(\\d{1,2}:\\d{2} ?[ap]m)";
  const MONTH_RE =
    "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
  const DAY_RE =
    "(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:rs|rsday)?|fri(?:day)?|sat(?:urday)?)";
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const daysAgo = (n) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return d;
  };
  const timeOf = (t) => (t ? t.toUpperCase().replace(/ ?([AP]M)$/, " $1") : null);

  function parseStamp(raw) {
    const t = normalizeSpaces(raw).replace(/\s+at\s+/i, ", ").replace(/\s+/g, " ").trim();
    let m;
    if ((m = t.match(new RegExp(`^${TIME}$`, "i")))) {
      return { date: null, time: timeOf(m[1]) };
    }
    if ((m = t.match(new RegExp(`^(today|yesterday)(?:,? ${TIME})?$`, "i")))) {
      return { date: iso(daysAgo(m[1].toLowerCase() === "today" ? 0 : 1)), time: timeOf(m[2]) };
    }
    if ((m = t.match(new RegExp(`^${DAY_RE},?(?: ${TIME})?$`, "i")))) {
      const dow = DAYS.indexOf(m[1].slice(0, 3).toLowerCase());
      const diff = (now.getDay() - dow + 7) % 7 || 7; // same weekday = last week
      return { date: iso(daysAgo(diff)), time: timeOf(m[2]) };
    }
    if ((m = t.match(new RegExp(`^${MONTH_RE} (\\d{1,2})(?:, (\\d{4}))?,?(?: ${TIME})?$`, "i")))) {
      const month = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
      const year = m[3] ? Number(m[3]) : now.getFullYear();
      let d = new Date(year, month, Number(m[2]));
      if (!m[3] && d > now) d = new Date(year - 1, month, Number(m[2])); // no year = last 12 months
      return { date: iso(d), time: timeOf(m[4]) };
    }
    if ((m = t.match(new RegExp(`^(\\d{1,2})/(\\d{1,2})/(\\d{2,4}),?(?: ${TIME})?$`, "i")))) {
      const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
      return { date: iso(new Date(y, Number(m[1]) - 1, Number(m[2]))), time: timeOf(m[4]) };
    }
    return null;
  }

  // Date separators in the conversation, in on-screen order (the chat list on
  // the left is outside role="main", so it's skipped).
  const separators = [];
  if (isMessenger) {
    const main = document.querySelector('[role="main"]') || document.body;
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.nodeValue.trim();
      if (!text || text.length > 60) continue;
      const parent = node.parentElement;
      // Skip text inside messages (a report may contain "7:00 AM" on its own line).
      if (!parent || parent.closest('[aria-label^="At "], [aria-label*="Message sent"]')) continue;
      const stamp = parseStamp(text);
      if (stamp) separators.push({ el: parent, stamp });
    }
  }

  // The date of the last separator above the photo.
  function separatorDateBefore(img) {
    let current = null;
    for (const sep of separators) {
      if (!(sep.el.compareDocumentPosition(img) & Node.DOCUMENT_POSITION_FOLLOWING)) break;
      if (sep.stamp.date) current = sep.stamp.date;
      else if (!current) current = iso(now); // a bare time means today
    }
    return current;
  }

  function messengerInfo(img) {
    const info = messageInfoOf(img);
    const stamp = info ? parseStamp(info.stamp) : null;
    return {
      sender: info ? info.sender : null,
      msgDate: (stamp && stamp.date) || separatorDateBefore(img),
      msgTime: stamp ? stamp.time : null,
    };
  }

  const imgs = Array.from(document.querySelectorAll("img"));

  return imgs
    .map((img, i) => {
      const renderedSrc = img.currentSrc || img.src || "";
      let fullSrc = renderedSrc;
      let sourceType = "rendered";

      // 1) Check srcset on the <img> itself for a higher-res candidate.
      const srcsetBest = bestFromSrcset(img.getAttribute("srcset"));
      if (srcsetBest) {
        fullSrc = srcsetBest;
        sourceType = "srcset";
      }

      // 2) Check srcset on a parent <picture>'s <source> tags.
      const picture = img.closest("picture");
      if (picture) {
        const sources = Array.from(picture.querySelectorAll("source"));
        for (const s of sources) {
          const candidate = bestFromSrcset(s.getAttribute("srcset"));
          if (candidate) {
            fullSrc = candidate;
            sourceType = "picture-source";
            break;
          }
        }
      }

      // 3) Check common lazy-load data-* attributes on the img itself.
      for (const attr of FULL_RES_ATTRS) {
        const val = img.getAttribute(attr);
        if (val && IMG_EXT_RE.test(val)) {
          fullSrc = val;
          sourceType = "data-attr";
          break;
        }
      }

      // 4) If the img is wrapped in a link that points straight at an
      // image file, that's usually the true full-size photo (common
      // "thumbnail links to full image" gallery pattern).
      const link = img.closest("a[href]");
      if (link) {
        const href = link.getAttribute("href") || "";
        if (IMG_EXT_RE.test(href)) {
          fullSrc = href;
          sourceType = "linked-full";
        }
      }

      // Resolve relative URLs against the page so downloads work.
      let resolved = fullSrc;
      try {
        resolved = new URL(fullSrc, document.baseURI).href;
      } catch (e) {
        // keep as-is if it can't be resolved
      }

      const msg = isMessenger ? messengerInfo(img) : { sender: null, msgDate: null, msgTime: null };
      let width = img.naturalWidth || img.width || 0;
      let height = img.naturalHeight || img.height || 0;
      // Messenger lazy-loads chat photos, so a fast Scan chat can reach a photo
      // before it has loaded (0×0). Its URL is already known, so keep it with
      // its on-screen size instead of dropping it as a placeholder.
      if ((!width || !height) && isMessenger && renderedSrc.includes("fbcdn.net")) {
        const rect = img.getBoundingClientRect();
        if (rect.width >= 60 && rect.height >= 60) {
          width = Math.round(rect.width);
          height = Math.round(rect.height);
        }
      }
      return {
        src: resolved,
        previewSrc: renderedSrc,
        sourceType,
        width,
        height,
        alt: img.alt || "",
        sender: msg.sender,
        msgDate: msg.msgDate, // "YYYY-MM-DD" (Messenger only)
        msgTime: msg.msgTime, // "10:20 AM" (Messenger only)
        index: i, // DOM order, as it appears in the page's HTML
      };
    })
    .filter((item) => item.src && item.src.startsWith("http"))
    .filter((item) => item.width > 0 && item.height > 0); // drop not-yet-rendered placeholders
}

// With `minDate` ("YYYY-MM-DD", used by Scan chat's "Stop at date"), photos
// from before that date are left out. Returns { added: [items added], older:
// how many were left out for being older than minDate }.
async function rescan({ minDate = "" } = {}) {
  const outcome = { added: [], older: 0 };
  setStatus("Scanning page...");
  downloadBtn.disabled = true;
  try {
    const tab = await getActiveTab();
    if (!tab || !tab.id) {
      setStatus("No active tab found.");
      return outcome;
    }
    const url = tab.url || "";
    const isRestricted =
      !url ||
      url.startsWith("chrome://") ||
      url.startsWith("chrome-extension://") ||
      url.startsWith("edge://") ||
      url.startsWith("about:") ||
      url.startsWith("https://chrome.google.com/webstore");
    if (isRestricted) {
      setStatus(
        "This tab can't be scanned (it's a browser page, not a website). Switch to the page with the images, then click \"Rescan page\"."
      );
      currentImages = [];
      render();
      return outcome;
    }
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scanImagesInPage,
    });
    const freshItems = result || [];

    if (accumulateCheckbox.checked) {
      // Keep everything we already have; only append genuinely new photos
      // (matched by their full-res URL) so positions never shift around.
      const existingSrcs = new Set(currentImages.map((i) => i.src));
      let addedCount = 0;
      freshItems.forEach((item) => {
        if (minDate && item.msgDate && item.msgDate < minDate) {
          outcome.older++;
          return;
        }
        if (!existingSrcs.has(item.src)) {
          const added = {
            ...item,
            id: `img-${currentImages.length}`,
            selected: false,
            order: ++orderCounter,
          };
          currentImages.push(added);
          outcome.added.push(added);
          existingSrcs.add(item.src);
          addedCount++;
        }
      });
      render();
      setStatus(
        addedCount ? `Added ${addedCount} new image(s).` : "No new images found since last scan."
      );
    } else {
      orderCounter = 0;
      currentImages = freshItems.map((item) => ({
        ...item,
        id: `img-${orderCounter}`,
        selected: false,
        order: ++orderCounter,
      }));
      render();
      setStatus(currentImages.length ? "" : "No images found on this page.");
    }
  } catch (err) {
    setStatus("Couldn't scan this page (it may be a restricted or protected page).");
    console.error(err);
  }
  return outcome;
}

// Naming helpers (buildBaseName, filenameFor, ...) live in shared.js.
function buildNameBase() {
  return buildBaseName(filenamePrefixInput.value, filenameDateInput.value);
}

function filenameFromSrc(src, order) {
  return filenameFor(src, order, buildNameBase());
}

function getVisibleImages() {
  return currentImages.filter(
    (item) =>
      (item.width === 0 || item.width >= minWidthFilter) &&
      (item.height === 0 || item.height >= minHeightFilter)
  );
}

function createTile(item, visibleIndex, visible) {
  const tile = document.createElement("div");
  tile.className = "tile" + (item.selected ? " selected" : "");
  // Matches the src the content script reports on hover, so we can
  // highlight this tile when the user hovers the photo on the page.
  tile.dataset.previewSrc = item.previewSrc || item.src;
  if (item.sender || item.msgDate || item.msgTime) {
    tile.title = [
      item.sender ? `From: ${item.sender}` : "",
      item.msgDate ? formatTrackerDate(item.msgDate) : "",
      item.msgTime || "",
    ]
      .filter(Boolean)
      .join(" · ");
  }

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = item.selected;
  checkbox.addEventListener("click", (e) => {
    e.stopPropagation();
    if (e.shiftKey) {
      e.preventDefault();
      applyShiftRange(visible, visibleIndex, checkbox.checked);
    } else {
      lastClickedIndex = visibleIndex;
    }
  });
  checkbox.addEventListener("change", () => {
    item.selected = checkbox.checked;
    tile.classList.toggle("selected", item.selected);
    updateDownloadButtonState();
  });

  const order = document.createElement("div");
  order.className = "order";
  order.textContent = item.order;

  const thumb = document.createElement("img");
  thumb.className = "thumb";
  // Use the rendered preview for the thumbnail (fast, reliable to load);
  // the full-res "src" is what actually gets downloaded.
  thumb.src = item.previewSrc || item.src;
  thumb.loading = "lazy";
  thumb.alt = item.alt;
  // If the thumbnail can't actually load (broken/placeholder image that
  // was scanned before it finished loading), drop it from the list instead
  // of leaving a dead entry behind.
  thumb.addEventListener("error", () => {
    const idx = currentImages.indexOf(item);
    if (idx !== -1) {
      currentImages.splice(idx, 1);
      render();
    }
  });

  const dim = document.createElement("div");
  dim.className = "dim";
  dim.textContent = item.width && item.height ? `${item.width}×${item.height}` : "";

  tile.appendChild(checkbox);
  tile.appendChild(order);
  tile.appendChild(thumb);
  if (dim.textContent) tile.appendChild(dim);

  tile.addEventListener("click", (e) => {
    const newState = !item.selected;
    if (e.shiftKey) {
      applyShiftRange(visible, visibleIndex, newState);
    } else {
      item.selected = newState;
      tile.classList.toggle("selected", item.selected);
      checkbox.checked = item.selected;
      updateDownloadButtonState();
      lastClickedIndex = visibleIndex;
    }
  });

  return tile;
}

// Groups items by sender, keeping page order inside each group; groups are
// ordered by where each sender's first photo appears.
function groupBySender(items) {
  const groups = new Map();
  items.forEach((item) => {
    const name = item.sender || "Unknown sender";
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(item);
  });
  return groups;
}

function createSenderSection(name, items, startIndex, visible) {
  const section = document.createElement("section");
  section.className = "sender-group";

  const header = document.createElement("div");
  header.className = "sender-header";
  const title = document.createElement("span");
  title.textContent = `${name} (${items.length})`;
  const toggle = document.createElement("button");
  const allSelected = items.every((i) => i.selected);
  toggle.textContent = allSelected ? "Unselect" : "Select all";
  toggle.addEventListener("click", () => {
    items.forEach((i) => (i.selected = !allSelected));
    render();
  });
  header.appendChild(title);
  header.appendChild(toggle);

  const grid = document.createElement("div");
  grid.className = "sender-grid";
  items.forEach((item, i) => grid.appendChild(createTile(item, startIndex + i, visible)));

  section.appendChild(header);
  section.appendChild(grid);
  return section;
}

function render() {
  listEl.innerHTML = "";
  let visible = getVisibleImages();
  const hiddenCount = currentImages.length - visible.length;
  // Only group when the scan actually found senders (i.e. on Messenger).
  const grouped = groupBySenderCheckbox.checked && visible.some((i) => i.sender);

  emptyEl.style.display = currentImages.length ? "none" : "block";
  countEl.textContent = currentImages.length
    ? `${visible.length} of ${currentImages.length} image(s) shown, ` +
      (grouped ? "grouped by sender" : "in page order") +
      (hiddenCount ? ` (${hiddenCount} hidden by filter)` : "")
    : "";

  listEl.classList.toggle("grouped", grouped);
  if (grouped) {
    const groups = groupBySender(visible);
    // Display order, so shift-click ranges follow what's on screen.
    visible = [...groups.values()].flat();
    let index = 0;
    for (const [name, items] of groups) {
      listEl.appendChild(createSenderSection(name, items, index, visible));
      index += items.length;
    }
  } else {
    visible.forEach((item, visibleIndex) => {
      listEl.appendChild(createTile(item, visibleIndex, visible));
    });
  }

  updateDownloadButtonState();
}

function applyShiftRange(visibleList, endIndex, desiredState) {
  const startIndex = lastClickedIndex === null ? endIndex : lastClickedIndex;
  const [from, to] = startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
  for (let i = from; i <= to; i++) {
    if (visibleList[i]) visibleList[i].selected = desiredState;
  }
  render();
}

function updateDownloadButtonState() {
  const selectedCount = currentImages.filter((i) => i.selected).length;
  downloadBtn.disabled = downloading || selectedCount === 0;
  downloadBtn.textContent = selectedCount > 0 ? `Download ${selectedCount} selected` : "Download selected";
  // Counts on the Photos header stay visible even while the photos are hidden.
  photosToggleCount.textContent = currentImages.length
    ? `${currentImages.length} photo(s)` + (selectedCount ? ` • ${selectedCount} selected` : "")
    : "";
}

// Hides/shows the photo preview; while hidden, Folder Settings moves up and
// gets the freed-up space.
function setPhotosCollapsed(collapsed) {
  appShell.classList.toggle("photos-collapsed", collapsed);
  photosToggle.setAttribute("aria-expanded", String(!collapsed));
  photosToggleArrow.textContent = collapsed ? "▸" : "▾";
}

photosToggle.addEventListener("click", () => {
  const collapsed = !appShell.classList.contains("photos-collapsed");
  setPhotosCollapsed(collapsed);
  chrome.storage.local.set({ photosCollapsed: collapsed }).catch((err) => {
    console.error("Couldn't save photos collapsed state:", err);
  });
});

function setAllSelected(value) {
  // Only affects images currently visible under the size filter.
  getVisibleImages().forEach((item) => (item.selected = value));
  render();
}

// DOWNLOAD_CONCURRENCY, maxNumberForBase, listDownloadedFileNames, makeUnique
// and runWithConcurrency live in shared.js.

async function listFolderFileNames(dirHandle) {
  const names = [];
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind === "file") names.push(name);
  }
  return names;
}

// Assigns every selected photo its final filename up front. Numbering
// continues after the highest number already in the destination, so a
// second batch with the same name/date never overwrites the first one.
async function planFilenames(selected, dirHandle) {
  const base = buildNameBase();
  let existingNames = [];
  if (dirHandle) existingNames = await listFolderFileNames(dirHandle);
  else if (base) existingNames = await listDownloadedFileNames(base);

  // Lowercased because Windows file names are case-insensitive.
  const taken = new Set(existingNames.map((n) => n.toLowerCase()));
  let next = base ? maxNumberForBase(existingNames, base) + 1 : 1;
  return selected.map((item) => {
    const filename = makeUnique(filenameFromSrc(item.fullSrc || item.src, next++), taken);
    taken.add(filename.toLowerCase());
    return filename;
  });
}


// This function is injected into the page. It must be self-contained.
// "save" locks the chat at its current scroll position: Messenger scrolls the
// chat by itself while photos are opened and closed in the viewer (e.g. when
// it moves focus back to the chat), and the lock undoes that right away.
// "restore" removes the lock and puts the chat back where it was.
function rememberChatScroll(mode, anchorSrc) {
  const prev = window.__pipChatScroll;
  if (prev) {
    // Always drop an existing lock first so it can never be left behind.
    prev.el.removeEventListener("scroll", prev.onScroll);
    clearTimeout(prev.safety);
    window.__pipChatScroll = null;
    if (mode === "restore") {
      prev.el.scrollTop = prev.top;
      return true;
    }
  }
  if (mode !== "save") return false;

  // The chat's scroll container is the nearest scrollable ancestor of a chat
  // photo (the role="log" element is not an ancestor of it).
  const anchor = Array.from(document.images).find((img) => (img.currentSrc || img.src) === anchorSrc);
  let scroller = null;
  for (let el = anchor && anchor.parentElement; el && el !== document.body; el = el.parentElement) {
    const oy = getComputedStyle(el).overflowY;
    if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 10) {
      scroller = el;
      break;
    }
  }
  if (!scroller) return false;

  const state = { el: scroller, top: scroller.scrollTop };
  state.onScroll = () => {
    if (Math.abs(scroller.scrollTop - state.top) > 1) scroller.scrollTop = state.top;
  };
  scroller.addEventListener("scroll", state.onScroll, { passive: true });
  // Safety net: never keep the chat locked for more than 5 minutes.
  state.safety = setTimeout(() => {
    scroller.removeEventListener("scroll", state.onScroll);
    if (window.__pipChatScroll === state) window.__pipChatScroll = null;
  }, 5 * 60 * 1000);
  window.__pipChatScroll = state;
  return true;
}

function isMessengerUrl(url) {
  return /^https:\/\/([a-z0-9-]+\.)*(messenger|facebook)\.com\//i.test(url || "");
}

function showProgress(label, current, total) {
  downloadProgressEl.style.display = "block";
  const pct = total ? Math.round((current / total) * 100) : 0;
  downloadProgressFill.style.width = `${pct}%`;
  downloadProgressText.textContent = `${label} ${current} / ${total} (${pct}%)`;
}

function hideProgress() {
  downloadProgressEl.style.display = "none";
  downloadProgressFill.style.width = "0%";
}

function needsFullRes(item) {
  return !item.fullSrc && item.src.includes("fbcdn.net");
}

// Swaps Messenger chat thumbnails for the full-size photo (what the viewer's
// Save button gives), one photo at a time since only one viewer can be open.
// `onProgress(done, total)` is called after each photo.
async function upgradeMessengerPhotos(tabId, items, { scrollSearch = false, onProgress } = {}) {
  let pending = items.filter(needsFullRes);
  // The worker tab opens at the newest messages, so go newest-first and
  // only ever scroll upward.
  if (scrollSearch) pending = pending.slice().reverse();
  let openKey = null; // file name of the photo whose viewer is still open
  let reuse = true; // keep the viewer open between photos until that fails

  async function runInPage(options) {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: getFullResFromViewer,
      args: [options],
    });
    return result;
  }

  async function chatScroll(mode) {
    const anchorSrc = pending.length ? pending[0].previewSrc || pending[0].src : null;
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: rememberChatScroll,
        args: [mode, anchorSrc],
      });
    } catch (err) {
      console.error(`Couldn't ${mode} the chat scroll position:`, err);
    }
  }

  // In the user's own tab, leave the chat exactly where they had it.
  // (The background tab has to scroll to find older photos, so not there.)
  if (!scrollSearch && pending.length) await chatScroll("save");

  for (let i = 0; i < pending.length; i++) {
    const item = pending[i];
    try {
      const result = await runInPage({
        thumbSrc: item.previewSrc || item.src,
        openKey,
        reuse,
        scrollSearch,
      });
      openKey = result.openKey;
      if (result.reuseFailed) reuse = false;
      if (result.full) item.fullSrc = result.full;
    } catch (err) {
      console.error("Couldn't get full-quality photo:", item.src, err);
      openKey = null;
    }
    if (onProgress) onProgress(i + 1, pending.length);
  }

  if (openKey) {
    try {
      await runInPage({ openKey, closeOnly: true });
    } catch (err) {
      console.error("Couldn't close the photo viewer:", err);
    }
  }
  if (!scrollSearch && pending.length) await chatScroll("restore");
}

function waitForTabComplete(tabId, timeout) {
  return new Promise((resolve) => {
    let timer = null;
    const listener = (id, info) => {
      if (id === tabId && info.status === "complete") finish();
    };
    function finish() {
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(timer);
      resolve();
    }
    chrome.tabs.onUpdated.addListener(listener);
    timer = setTimeout(finish, timeout);
    chrome.tabs
      .get(tabId)
      .then((tab) => {
        if (tab.status === "complete") finish();
      })
      .catch(finish);
  });
}

// This function is injected into the page. It must be self-contained.
// Waits until the chat has rendered some photos (the page's "complete" event
// fires long before Messenger draws the conversation).
function waitForChatPhotos(timeout) {
  const has = () =>
    Array.from(document.images).some(
      (img) => (img.currentSrc || img.src).includes("fbcdn.net") && img.naturalWidth > 80
    );
  if (has()) return true;
  return new Promise((resolve) => {
    const obs = new MutationObserver(() => {
      if (has()) finish(true);
    });
    const timer = setInterval(() => {
      if (has()) finish(true);
    }, 250);
    const timeoutId = setTimeout(() => finish(has()), timeout);
    function finish(value) {
      obs.disconnect();
      clearInterval(timer);
      clearTimeout(timeoutId);
      resolve(value);
    }
    obs.observe(document.documentElement, { childList: true, subtree: true });
  });
}

// Gets full-size URLs for the selected Messenger photos, opening them in the
// user's own chat tab. With the "background tab" setting on, it works in a
// separate background tab first so the user's chat isn't disturbed (slower),
// and anything that tab couldn't reach (e.g. photos far up the chat) is
// retried in the user's tab. Returns how many stayed at thumbnail quality.
async function getFullQualityPhotos(sourceTab, items) {
  const total = items.filter(needsFullRes).length;
  if (!total) return 0;
  const progress = () =>
    showProgress("Getting full-quality photos...", total - items.filter(needsFullRes).length, total);
  progress();

  if (!messengerBackgroundTabCheckbox.checked) {
    await upgradeMessengerPhotos(sourceTab.id, items, { onProgress: progress });
    return items.filter(needsFullRes).length;
  }

  // Only a conversation URL reopens the same chat; a chat popup on another
  // Facebook page wouldn't exist in a fresh tab.
  const isThreadUrl = /\/t\/[^/?#]+/.test(sourceTab.url || "");
  let workerTabId = null;
  try {
    if (!isThreadUrl) throw new Error("Not a conversation URL; using the current tab.");
    const workerTab = await chrome.tabs.create({ url: sourceTab.url, active: false, index: sourceTab.index + 1 });
    workerTabId = workerTab.id;
    await waitForTabComplete(workerTabId, 30000);
    const [{ result: ready }] = await chrome.scripting.executeScript({
      target: { tabId: workerTabId },
      func: waitForChatPhotos,
      args: [15000],
    });
    if (ready) {
      await upgradeMessengerPhotos(workerTabId, items, { scrollSearch: true, onProgress: progress });
    }
  } catch (err) {
    console.error("Background tab couldn't get full-quality photos:", err);
  } finally {
    if (workerTabId != null) chrome.tabs.remove(workerTabId).catch(() => {});
  }

  // Fallback: whatever the background tab missed, try in the user's own tab.
  if (items.some(needsFullRes)) {
    setStatus("Some photos weren't reachable in the background tab — opening them here...");
    await upgradeMessengerPhotos(sourceTab.id, items, { onProgress: progress });
  }
  return items.filter(needsFullRes).length;
}

async function saveToFolder(dirHandle, src, filename) {
  const resp = await fetch(src);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const blob = await resp.blob();
  const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

let downloading = false; // one batch at a time (toolbar button or Messenger menu)

async function downloadSelected() {
  const selected = getVisibleImages()
    .filter((i) => i.selected)
    .sort((a, b) => a.order - b.order); // keep page order
  if (!selected.length) return;

  if (await downloadItems(selected)) {
    // Auto-unselect everything after a download so the next batch starts clean.
    currentImages.forEach((item) => (item.selected = false));
    render();
  }
}

// Downloads `selected` with the current naming, folder and full-quality
// settings. `sourceTab` is the tab the photos are in (defaults to the active
// tab). Returns true if a download actually ran.
async function downloadItems(selected, sourceTab) {
  if (downloading || !selected.length) return false;
  downloading = true;
  try {
    return await runDownload(selected, sourceTab);
  } finally {
    downloading = false;
    updateDownloadButtonState();
  }
}

async function runDownload(selected, sourceTab) {
  if (!(await confirmMissingNaming(selected[0]))) return false;

  // Captured now so changing the folder mid-download can't split a batch.
  const dirHandle = destDirHandle;
  const dirPath = destDirPath;

  downloadBtn.disabled = true;
  const total = selected.length;
  const errors = [];
  let done = 0;

  let lowQualityCount = 0;
  if (messengerFullQualityCheckbox.checked) {
    const tab = sourceTab || (await getActiveTab());
    if (tab && tab.id && isMessengerUrl(tab.url)) {
      lowQualityCount = await getFullQualityPhotos(tab, selected);
    }
  }

  setStatus("Preparing filenames...");
  let filenames;
  try {
    filenames = await planFilenames(selected, dirHandle);
  } catch (err) {
    console.error(err);
    hideProgress();
    setStatus("Couldn't read the destination folder (it may have been moved, or permission was revoked).");
    return false;
  }

  const verb = dirHandle ? "Saving photos" : "Downloading";
  setStatus("");
  showProgress(`${verb}...`, 0, total);
  await runWithConcurrency(total, DOWNLOAD_CONCURRENCY, async (i) => {
    const item = selected[i];
    const url = item.fullSrc || item.src;
    const filename = filenames[i];
    try {
      if (dirHandle) {
        // Fetch the image ourselves and write it straight into the folder
        // the user selected in the tree.
        await saveToFolder(dirHandle, url, filename);
      } else {
        // Hand off to Chrome's Downloads folder.
        await chrome.downloads.download({
          url,
          filename,
          conflictAction: "uniquify",
        });
      }
      done++;
    } catch (err) {
      console.error("Failed to save:", item.src, err);
      errors.push(`${filename}: ${err.message || err}`);
    }
    showProgress(`${verb}...`, done + errors.length, total);
  });
  hideProgress();

  if (dirHandle) {
    setStatus(`Saved ${done} of ${total} image(s) to "${dirPath.join(" / ")}".`);
  } else {
    setStatus(`Downloaded ${done} of ${total} image(s).`);
  }
  showCompletionModal({
    succeeded: done,
    failed: total - done,
    destinationLabel: dirHandle ? dirPath.join(" / ") : "Downloads folder",
    errors,
    lowQualityCount,
  });

  // "Save as" and the date both stay as they are for the next batch
  // (consecutive downloads usually share them).
  return true;
}

rescanBtn.addEventListener("click", rescan);
selectAllBtn.addEventListener("click", () => setAllSelected(true));
selectNoneBtn.addEventListener("click", () => setAllSelected(false));
downloadBtn.addEventListener("click", downloadSelected);

applyFilterBtn.addEventListener("click", () => {
  minWidthFilter = parseInt(minWidthInput.value, 10) || 0;
  minHeightFilter = parseInt(minHeightInput.value, 10) || 0;
  saveFilter();
  render();
});

clearFilterBtn.addEventListener("click", () => {
  minWidthInput.value = "";
  minHeightInput.value = "";
  minWidthFilter = 0;
  minHeightFilter = 0;
  saveFilter();
  render();
});

// Load the last-saved min width/height, then scan the page.
loadSavedFilter().then(rescan);
// Try to restore a previously-chosen main folder (if permission still holds).
initFolderPicker();

accumulateCheckbox.addEventListener("change", () => {
  chrome.storage.local.set({ accumulate: accumulateCheckbox.checked }).catch((err) => {
    console.error("Couldn't save accumulate setting:", err);
  });
});

function resetAll() {
  stopAutoScan();
  currentImages = [];
  orderCounter = 0;
  lastClickedIndex = null;
  // Turn accumulate back off too, since "reset" should mean a truly fresh
  // start, not just an empty list with the old mode still stuck on.
  accumulateCheckbox.checked = false;
  chrome.storage.local.set({ accumulate: false }).catch(() => {});
  render();
  setStatus('Reset. Click "Rescan page" or "Scan chat" to start fresh.');
}

resetBtn.addEventListener("click", resetAll);

async function autoScanTick() {
  const myGeneration = autoScanGeneration;
  try {
    const tab = await getActiveTab();
    if (myGeneration !== autoScanGeneration) return; // stopped/reset while awaiting
    if (!tab || !tab.id) {
      stopAutoScan();
      setStatus("No active tab found. Stopped auto-scan.");
      return;
    }
    const amount = parseInt(scrollAmountInput.value, 10) || 600;
    const [{ result: scrollResult }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrollPageUp,
      args: [amount],
    });
    if (myGeneration !== autoScanGeneration) return; // stopped/reset while awaiting

    const stopDate = scanStopDateInput.value; // "" = no date limit
    // Runs in accumulate mode (forced on when auto-scan starts).
    const outcome = await rescan({ minDate: stopDate });
    if (myGeneration !== autoScanGeneration) return; // stopped/reset while awaiting

    updateScanTracker(outcome.added);
    if (stopDate && outcome.older > 0) {
      // Scrolled past the stop date: everything from that day is collected.
      stopAutoScan();
      setStatus(
        `Reached photos from before ${formatTrackerDate(stopDate)} — stopped. Collected ${currentImages.length} image(s).`
      );
      return;
    }

    // At the top, Messenger loads older messages (the chat gets taller and can
    // scroll again), so only stop once it has stayed at the top with nothing
    // new loading for a few seconds.
    if (scrollResult && scrollResult.atTop && scrollResult.scrollHeight === autoScanLastHeight) {
      autoScanIdleSince = autoScanIdleSince || Date.now();
      if (Date.now() - autoScanIdleSince >= AUTO_SCAN_TOP_WAIT_MS) {
        stopAutoScan();
        setStatus(`Reached the top of the chat. Collected ${currentImages.length} image(s).`);
      }
    } else {
      autoScanIdleSince = null;
    }
    autoScanLastHeight = scrollResult ? scrollResult.scrollHeight : null;
  } catch (err) {
    if (myGeneration !== autoScanGeneration) return; // already stopped/reset, ignore
    console.error(err);
    stopAutoScan();
    setStatus("Auto-scan stopped due to an error (see console).");
  }
}

// --- Scan chat tracker: where (date & time) the scan has reached --------------

function trackerMinutes(time) {
  const m = /^(\d{1,2}):(\d{2}) ([AP]M)$/.exec(time || "");
  return m ? ((Number(m[1]) % 12) + (m[3] === "PM" ? 12 : 0)) * 60 + Number(m[2]) : -1;
}

function formatTrackerDate(isoDate) {
  const [y, m, d] = (isoDate || "").split("-").map(Number);
  if (!y || !m || !d) return "date unknown";
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Shows the oldest photo picked up in the last step: since the chat scrolls
// up, that's how far back the scan has got.
function updateScanTracker(addedItems) {
  if (!addedItems.length) return;
  const oldest = addedItems.reduce((best, item) => {
    if (!best) return item;
    if (item.msgDate && (!best.msgDate || item.msgDate < best.msgDate)) return item;
    if (item.msgDate === best.msgDate && trackerMinutes(item.msgTime) < trackerMinutes(best.msgTime)) return item;
    return best;
  }, null);
  scanTrackerEl.textContent =
    `📍 Now at: ${formatTrackerDate(oldest.msgDate)}` +
    (oldest.msgTime ? ` · ${oldest.msgTime}` : "") +
    (oldest.sender ? ` (${oldest.sender})` : "");
}

const MIN_SCAN_INTERVAL_SEC = 0.2;
const AUTO_SCAN_TOP_WAIT_MS = 3000; // how long to wait at the top for older messages
let autoScanIdleSince = null; // when the chat was first seen stuck at the top
let autoScanLastHeight = null;

function startAutoScan() {
  autoScanGeneration++; // fresh generation for this run
  const myGeneration = autoScanGeneration;
  accumulateCheckbox.checked = true;
  chrome.storage.local.set({ accumulate: true }).catch(() => {});

  const parsed = parseFloat(scanIntervalInput.value);
  const seconds = Number.isFinite(parsed) ? Math.max(MIN_SCAN_INTERVAL_SEC, parsed) : 2;
  autoScanIdleSince = null;
  autoScanLastHeight = null;
  scanTrackerEl.textContent = "📍 Waiting for the first photo…";
  scanStopDateInput.disabled = true;
  autoScanBtn.textContent = "Stop";
  autoScanBtn.classList.add("stopping");
  scrollAmountInput.disabled = true;
  scanIntervalInput.disabled = true;
  rescanBtn.disabled = true;

  // Each step waits for the previous one to finish (scroll + rescan) before
  // the next is scheduled, so short intervals can't make scans overlap.
  const step = async () => {
    await autoScanTick();
    if (myGeneration !== autoScanGeneration) return; // stopped/reset meanwhile
    autoScanTimer = setTimeout(step, seconds * 1000);
  };
  autoScanRunning = true;
  step();
}

function stopAutoScan() {
  autoScanGeneration++; // invalidate any tick currently in flight
  autoScanRunning = false;
  if (autoScanTimer) {
    clearTimeout(autoScanTimer);
    autoScanTimer = null;
  }
  autoScanBtn.textContent = "Scan chat";
  autoScanBtn.classList.remove("stopping");
  scrollAmountInput.disabled = false;
  scanIntervalInput.disabled = false;
  scanStopDateInput.disabled = false;
  rescanBtn.disabled = false;
}

scanStopDateInput.addEventListener("change", () => {
  chrome.storage.local.set({ scanStopDate: scanStopDateInput.value }).catch((err) => {
    console.error("Couldn't save stop date:", err);
  });
});

autoScanBtn.addEventListener("click", () => {
  if (autoScanRunning) {
    stopAutoScan();
    setStatus("Auto-scan stopped.");
  } else {
    startAutoScan();
  }
});

// Highlight the matching tile when the user hovers a photo on the page, and
// handle "Download photos" from the Messenger ⋯ menu (content-messenger-menu.js).
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;
  if (msg.type === "DOWNLOAD_MESSAGE_PHOTOS") {
    if (downloading) {
      sendResponse({ ok: false, reason: "busy" });
      return;
    }
    const items = (msg.photos || [])
      .filter((p) => p.src && p.src.startsWith("http"))
      .map((p) => {
        // Reuse the scanned item if there is one, so a full-size URL that was
        // already found doesn't have to be looked up again.
        const known = currentImages.find((i) => i.src === p.src || i.previewSrc === p.src);
        return known || { ...p, previewSrc: p.src, sourceType: "rendered", sender: null };
      });
    sendResponse({ ok: items.length > 0 });
    if (items.length) {
      downloadItems(items, sender.tab).finally(() => {
        // Lets the Messenger tab stop holding the chat's scroll position.
        if (sender.tab && sender.tab.id != null) {
          chrome.tabs.sendMessage(sender.tab.id, { type: "MESSAGE_PHOTOS_DONE" }).catch(() => {});
        }
      });
    }
    return;
  }
  if (msg.type === "IMAGE_HOVER") {
    const prev = listEl.querySelector(".tile.hover-highlighted");
    if (prev) prev.classList.remove("hover-highlighted");
    const match = listEl.querySelector(`.tile[data-preview-src="${CSS.escape(msg.src)}"]`);
    if (match) {
      match.classList.add("hover-highlighted");
      match.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  } else if (msg.type === "IMAGE_HOVER_END") {
    const prev = listEl.querySelector(".tile.hover-highlighted");
    if (prev) prev.classList.remove("hover-highlighted");
  }
});

function updateNamingPreview() {
  const base = buildNameBase();
  namingPreview.textContent = base
    ? `e.g. "${base} (1).jpg", "${base} (2).jpg" (continues after existing numbers)`
    : "";
}

filenamePrefixInput.addEventListener("input", () => {
  updateNamingPreview();
  chrome.storage.local.set({ filenamePrefix: filenamePrefixInput.value }).catch((err) => {
    console.error("Couldn't save Save as name:", err);
  });
});
attachPresetDropdown(filenamePrefixInput); // from shared.js
filenameDateInput.addEventListener("input", () => {
  updateNamingPreview();
  chrome.storage.local.set({ filenameDate: filenameDateInput.value }).catch((err) => {
    console.error("Couldn't save date:", err);
  });
});

// Keep "Save as" and the date in step when they're changed from the Messenger form.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.filenamePrefix) {
    const prefix = changes.filenamePrefix.newValue || "";
    if (filenamePrefixInput.value !== prefix) {
      filenamePrefixInput.value = prefix;
      updateNamingPreview();
    }
  }
  if (!changes.filenameDate) return;
  const value = changes.filenameDate.newValue || "";
  if (filenameDateInput.value !== value) {
    filenameDateInput.value = value;
    updateNamingPreview();
  }
});
updateNamingPreview();

settingsBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  settingsPanel.classList.toggle("open");
});

document.addEventListener("click", (e) => {
  if (settingsPanel.classList.contains("open") && !settingsPanel.contains(e.target) && e.target !== settingsBtn) {
    settingsPanel.classList.remove("open");
  }
});

showAutoScanCheckbox.addEventListener("change", () => {
  const show = showAutoScanCheckbox.checked;
  autoScanBar.style.display = show ? "flex" : "none";
  chrome.storage.local.set({ showAutoScan: show }).catch((err) => {
    console.error("Couldn't save showAutoScan setting:", err);
  });
});

messengerFullQualityCheckbox.addEventListener("change", () => {
  chrome.storage.local
    .set({ messengerFullQuality: messengerFullQualityCheckbox.checked })
    .catch((err) => {
      console.error("Couldn't save Messenger full quality setting:", err);
    });
});

messengerBackgroundTabCheckbox.addEventListener("change", () => {
  chrome.storage.local
    .set({ messengerBackgroundTab: messengerBackgroundTabCheckbox.checked })
    .catch((err) => {
      console.error("Couldn't save background tab setting:", err);
    });
});

groupBySenderCheckbox.addEventListener("change", () => {
  lastClickedIndex = null; // display order changes, so old shift-click anchor is meaningless
  render();
  chrome.storage.local
    .set({ groupBySender: groupBySenderCheckbox.checked })
    .catch((err) => {
      console.error("Couldn't save group-by-sender setting:", err);
    });
});

hoverColorPicker.addEventListener("input", () => {
  const color = hoverColorPicker.value;
  document.documentElement.style.setProperty("--hover-highlight", color);
  chrome.storage.local.set({ hoverHighlightColor: color }).catch((err) => {
    console.error("Couldn't save hover highlight color:", err);
  });
});
