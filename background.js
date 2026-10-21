// Naming helpers and the Messenger full-quality lookup, shared with the side panel.
importScripts("shared.js");

// Opens the side panel when the user clicks the extension's toolbar icon.
chrome.action.onClicked.addListener((tab) => {
  if (tab.windowId != null) {
    chrome.sidePanel.open({ windowId: tab.windowId });
  }
});

// Make sure the side panel is allowed to open on every tab.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
    // setPanelBehavior + action.onClicked can conflict on some Chrome versions;
    // the onClicked listener above is the fallback if this call is unsupported.
  });
});

// "Download photos" from the Messenger ⋯ menu while the side panel is closed:
// content-messenger-menu.js asks for a name and date in the page, then hands
// the photos over here. They're saved into the folder last chosen in the side
// panel (via offscreen.html) when Chrome still allows it, otherwise into the
// Downloads folder.
let quickDownloadRunning = false;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "QUICK_DOWNLOAD_PHOTOS") return;
  if (quickDownloadRunning) {
    sendResponse({ ok: false, reason: "busy" });
    return;
  }
  sendResponse({ ok: true });
  quickDownload(msg, sender.tab);
});

async function quickDownload({ photos, name, date }, tab) {
  quickDownloadRunning = true;
  let done = 0;
  let failed = 0;
  let lowQuality = 0;
  let savedTo = null; // folder path label when saved into the chosen folder
  let folderProblem = null; // why the chosen folder couldn't be used
  try {
    const items = (photos || [])
      .filter((p) => p.src && p.src.startsWith("http"))
      .map((p) => ({ ...p }));

    const { messengerFullQuality, destPath } = await chrome.storage.local.get([
      "messengerFullQuality",
      "destPath",
    ]);
    if (messengerFullQuality === true && tab && tab.id != null) {
      lowQuality = await getFullQualityInTab(tab.id, items);
    }

    // The folder chosen in the side panel, if Chrome still lets us write there.
    if (Array.isArray(destPath) && destPath.length) {
      const result = await saveViaOffscreen({
        urls: items.map((item) => item.fullSrc || item.src),
        name,
        date,
        destPath,
      });
      if (result && result.ok) {
        done = result.done;
        failed = result.failed;
        savedTo = result.folder;
        return;
      }
      folderProblem = (result && result.reason) || "error";
    }

    // Downloads folder. Same naming as the side panel: numbering continues
    // after files already downloaded with this name, so nothing gets overwritten.
    const base = buildBaseName(name, date);
    const existing = base ? await listDownloadedFileNames(base) : [];
    const taken = new Set(existing.map((n) => n.toLowerCase()));
    let next = base ? maxNumberForBase(existing, base) + 1 : 1;
    const filenames = items.map((item) => {
      const filename = makeUnique(filenameFor(item.fullSrc || item.src, next++, base), taken);
      taken.add(filename.toLowerCase());
      return filename;
    });

    await runWithConcurrency(items.length, DOWNLOAD_CONCURRENCY, async (i) => {
      try {
        await chrome.downloads.download({
          url: items[i].fullSrc || items[i].src,
          filename: filenames[i],
          conflictAction: "uniquify",
        });
        done++;
      } catch (err) {
        console.error("Failed to download:", items[i].src, err);
        failed++;
      }
    });
  } catch (err) {
    console.error("Quick download failed:", err);
  } finally {
    quickDownloadRunning = false;
    // Tells the page the download is over (releases its scroll hold, shows a summary).
    if (tab && tab.id != null) {
      chrome.tabs
        .sendMessage(tab.id, {
          type: "MESSAGE_PHOTOS_DONE",
          summary: { done, failed, lowQuality, savedTo, folderProblem },
        })
        .catch(() => {});
    }
  }
}

async function saveViaOffscreen(request) {
  try {
    const exists = chrome.offscreen.hasDocument ? await chrome.offscreen.hasDocument() : false;
    if (!exists) {
      await chrome.offscreen.createDocument({
        url: "offscreen.html",
        reasons: ["BLOBS"],
        justification: "Save photos into the folder chosen in the side panel.",
      });
    }
    return await chrome.runtime.sendMessage({ type: "OFFSCREEN_SAVE_TO_FOLDER", ...request });
  } catch (err) {
    console.error("Couldn't save into the chosen folder:", err);
    return { ok: false, reason: "error" };
  } finally {
    chrome.offscreen.closeDocument().catch(() => {});
  }
}

// Opens each photo in Messenger's viewer to read its full-size URL (same as
// the side panel's "save full quality"). Returns how many stayed low quality.
async function getFullQualityInTab(tabId, items) {
  let openKey = null; // file name of the photo whose viewer is still open
  let reuse = true; // keep the viewer open between photos until that fails
  const runInPage = async (options) => {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: getFullResFromViewer,
      args: [options],
    });
    return result;
  };

  const pending = items.filter((item) => item.src.includes("fbcdn.net"));
  for (const item of pending) {
    try {
      const result = await runInPage({ thumbSrc: item.src, openKey, reuse });
      openKey = result.openKey;
      if (result.reuseFailed) reuse = false;
      if (result.full) item.fullSrc = result.full;
    } catch (err) {
      console.error("Couldn't get full-quality photo:", item.src, err);
      openKey = null;
    }
  }
  if (openKey) {
    try {
      await runInPage({ openKey, closeOnly: true });
    } catch (err) {
      console.error("Couldn't close the photo viewer:", err);
    }
  }
  return pending.filter((item) => !item.fullSrc).length;
}
