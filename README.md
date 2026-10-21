# Page Image Picker (Photodocs Automation)

A Chrome extension that scans any webpage for images, lets you pick the ones you want, and saves them **in page order**, with consistent file names, into the folder you choose. It has extra tools for **Facebook Messenger**, where it can download chat photos at full quality.

I built it to automate a real, repetitive task at work: collecting photo documentation that teams send in Messenger chats, then renaming and filing every photo by hand. The extension turns that into a few clicks.

> ### ⚡ This project was vibe coded
> I built this extension by **vibe coding** with an AI coding assistant (Claude Code). I wrote very little of the code by hand. My part was:
> - **Finding the problem.** I noticed the manual workflow was slow and easy to get wrong.
> - **Deciding what it should do.** I chose the features, the naming rules and the folder flow, and described them in plain language.
> - **Testing it on real work.** I used it on actual Messenger chats and photo batches, found bugs and edge cases, and reported them back.
> - **Iterating.** It took many rounds of "this breaks when…" and "it should also…" to get to version 2.3.
>
> I'm sharing it to show how I use AI tools to solve real problems and ship something useful, not as an example of hand-written code.

---

## Features

### Any webpage
- **Scans the page for images**, including lazy-loaded ones, and finds the highest-resolution version available (`srcset`, `<picture>` sources, `data-*` lazy-load attributes, thumbnail-to-full-image links).
- **Side panel preview** where you select images by click, shift-click for a range, select all, or select none.
- **Size filter** (minimum width and height) to hide icons and small images.
- **Hover sync:** hovering over a photo on the page highlights its tile in the side panel.
- **Downloads in page order**, with up to 4 downloads running at once.

### Consistent file names
- Names follow a **"Save as" + date** pattern, for example `SAMPLING_sep-09-26 (1).jpg`, `(2)`, `(3)`, and so on.
- **Numbering continues** after files already saved with the same name, so a second batch never overwrites the first.
- Characters that Windows doesn't allow in file names are replaced automatically.

### Saving to folders
- **Choose a main folder once** using the browser's folder picker (File System Access API). The extension scans every subfolder and shows them as an expandable tree.
- **Pick any subfolder as the destination**, or create a new one from the panel.
- The chosen folder is remembered between sessions (the folder handle is stored in IndexedDB). If it can't be used, downloads go to the normal Downloads folder.

### Facebook Messenger tools
- **"Download photos" in the message ⋯ menu.** The extension adds its own item to Messenger's menu, so you can download a message's photos without opening the side panel. A small form asks for the name and date.
- **Full-quality mode.** Chat images are compressed thumbnails, so this mode opens each photo in Messenger's viewer and reads the full-size URL. There's an optional background-tab mode that leaves your chat undisturbed.
- **Scan chat (auto-scroll).** Scrolls up through a conversation and collects photos as they load, with an optional "stop at date".
- **Group by sender:** reads each message's sender and date from the page's accessibility labels.
- **Scroll lock:** keeps the chat where you left it while the extension works.

---

## Tech overview

- **Chrome Extension, Manifest V3**, written in plain JavaScript with no frameworks and no build step.
- **Side Panel API** for the main interface.
- **Content scripts** for hover sync and for adding the Messenger menu item. The menu item is added by watching the page with a `MutationObserver`, and the Messenger form uses Shadow DOM so its styles don't clash with Facebook's.
- **`chrome.scripting.executeScript`** to run self-contained functions inside the page (image scanning, the full-quality lookup, scroll control).
- **Service worker and offscreen document** so the Messenger menu can save into the chosen folder even while the side panel is closed.
- **File System Access API and IndexedDB** for writing straight into user-chosen folders.
- **`chrome.downloads`** as the fallback, including checks of past downloads so numbering keeps going.

| File | What it does |
| --- | --- |
| `manifest.json` | Extension config and permissions |
| `sidepanel.html` / `sidepanel.js` | Main interface: scanning, selecting, the folder tree, downloads, Scan chat |
| `shared.js` | File naming, download concurrency, and the Messenger full-quality lookup (shared by the side panel and the background) |
| `background.js` | Service worker: opens the side panel and handles downloads started from the Messenger menu |
| `offscreen.html` / `offscreen.js` | Hidden page that writes files into the chosen folder while the side panel is closed |
| `content-hover.js` | Sends hover events from the page to the side panel |
| `content-messenger-menu.js` | Adds "Download photos" to Messenger's ⋯ menu |

---

## Install (developer mode)

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select this project's folder.
5. Click the extension's toolbar icon to open the side panel.

---

## Notes

- This is a personal productivity tool. It is **not affiliated with or endorsed by Meta, Facebook or Messenger**. The Messenger features depend on Messenger's current page structure and may break when Messenger changes.
- Only download photos you have the right to save.

## License

[MIT](LICENSE) © Justin Pimentel
