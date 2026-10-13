<p align="center">
  <img src="extension/icons/icon-128.png" width="96" height="96" alt="Desktop GIFs icon">
</p>

<h1 align="center">Desktop GIFs</h1>

<p align="center">
  <strong>Post GIFs in YouTube comments and replies from a desktop browser.</strong>
</p>

<p align="center">
  <a href="https://github.com/rayytor/desktop_gifs/releases/latest"><img src="https://img.shields.io/github/manifest-json/v/rayytor/desktop_gifs?filename=extension%2Fmanifest.json&label=version&color=ff0033" alt="Version"></a>
  <img src="https://img.shields.io/badge/Chrome-121%2B-4285F4?logo=googlechrome&logoColor=white" alt="Chrome 121 or newer">
  <img src="https://img.shields.io/badge/Firefox-140%2B-FF7139?logo=firefoxbrowser&logoColor=white" alt="Firefox 140 or newer">
  <img src="https://img.shields.io/badge/Manifest-V3-34A853" alt="Manifest V3">
  <a href="LICENSE"><img src="https://img.shields.io/github/license/rayytor/desktop_gifs" alt="License: GPL-3.0"></a>
</p>

<p align="center">
  <a href="#tampermonkey">Tampermonkey</a> ·
  <a href="#install">Install</a> ·
  <a href="#use">Use</a> ·
  <a href="#troubleshooting">Troubleshooting</a> ·
  <a href="#limits">Limits</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#privacy">Privacy</a>
</p>

> [!NOTE]
> **Tampermonkey fork by [cinovenx](https://github.com/cinovenx).**
> Upstream extension by [rayytor](https://github.com/rayytor/desktop_gifs) (GPL-3.0).
> This fork adds a single-file userscript [`desktop-gifs.user.js`](desktop-gifs.user.js) — no extension install needed.
> The `extension/` folder is untouched and still works as before.

<p align="center">
  <img src="screenshots/picker.png" width="720" alt="The GIF picker open above a comment box, showing search results for &quot;cat&quot;, one of them starred as a favorite">
</p>

YouTube's mobile app can attach a GIF to a comment; the desktop site has no button for it. Desktop GIFs adds one, next to the emoji button:

<p align="center">
  <img src="screenshots/button.png" width="720" alt="The GIF button next to the emoji button in a comment box">
</p>

- **Everyone sees your GIF.** It is posted as an ordinary YouTube GIF comment, so viewers do not need the extension.
- **Three clicks.** Open a comment box, click **GIF**, click the one you want.
- **Search or paste.** Search Tenor, or paste a Tenor link.
- **Favorites.** Star the GIFs you use often and find them behind one button.
- **Nothing to set up.** No account, no API key, no tracking.

<sub>The screenshots show the extension's own interface on a test page that stands in for YouTube's comment box.</sub>

## Tampermonkey

No extension install, no developer mode. Needs the
[Tampermonkey](https://www.tampermonkey.net/) browser extension.

1. Open this raw file and confirm the Tampermonkey install prompt:
   [`desktop-gifs.user.js`](https://raw.githubusercontent.com/cinovenx/desktop_gifs/main/desktop-gifs.user.js)
   (alternatively: [`desktop-gifs.user.js`](desktop-gifs.user.js) in this repo → **Raw** → **Install**).
2. On install, allow access to `www.youtube.com`, `tenor.com` and `tenor.googleapis.com` when Tampermonkey asks (`@connect`).
3. Open any YouTube video — the **GIF** button appears next to the emoji button, no refresh of other tabs needed beyond one reload.

Notes:

- Single file, no build step: `content.js` + `main.js` + `sw.js` (via `GM_xmlhttpRequest`) + `content.css` (via `GM_addStyle`).
- Page hook, two modes: `<script>` injection into page world at `document-start` first; if the page's nonce-CSP silently drops inline scripts (YouTube does), the script patches `unsafeWindow.fetch` directly on first GIF click (needs the `unsafeWindow` grant). Both modes share one install flag, so there is never a double wrapper.
- Favorites are stored with `GM_setValue` (mirrored to `localStorage`), synced across tabs via `GM_addValueChangeListener`.
- Auto-update: `@updateURL`/`@downloadURL` point at `raw.githubusercontent.com/cinovenx/desktop_gifs/main/desktop-gifs.user.js`.
- Do not run the extension and the userscript at the same time — both use the same `gcfyLoaded` guard, the second one stays idle, but keeping one avoids confusion.
- Picker shows "No cross-origin request API…" or the console shows CORS errors: the script was installed without its `@grant`/`@connect` permissions (e.g. pasted as a snippet instead of installed from the `.user.js` file). Reinstall from the raw `.user.js` link above in Tampermonkey/Violentmonkey and accept the permission prompt. The error names the detected script manager in parentheses — include it when reporting.

## Install

Desktop GIFs is not on the Chrome Web Store or addons.mozilla.org yet, so it is loaded from a ZIP. There is one for each browser on the [latest release](https://github.com/rayytor/desktop_gifs/releases/latest).

<p>
  <a href="https://github.com/rayytor/desktop_gifs/releases/latest/download/desktop-gifs-chromium.zip"><img src="https://img.shields.io/badge/Download-Chrome%20%C2%B7%20Edge%20%C2%B7%20Brave-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Download for Chrome, Edge and Brave"></a>
  <a href="https://github.com/rayytor/desktop_gifs/releases/latest/download/desktop-gifs-firefox.zip"><img src="https://img.shields.io/badge/Download-Firefox-FF7139?style=for-the-badge&logo=firefoxbrowser&logoColor=white" alt="Download for Firefox"></a>
</p>

### Chrome, Edge, Brave

1. Download [`desktop-gifs-chromium.zip`](https://github.com/rayytor/desktop_gifs/releases/latest/download/desktop-gifs-chromium.zip) and unzip it.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and choose the unzipped folder, the one that has `manifest.json` directly inside it.

YouTube tabs that are already open get the button without a refresh.

Only Chrome is tested. Edge, Brave and other Chromium browsers should work the same way.

### Firefox

1. Download [`desktop-gifs-firefox.zip`](https://github.com/rayytor/desktop_gifs/releases/latest/download/desktop-gifs-firefox.zip). There is no need to unzip it.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and choose the ZIP.

YouTube tabs that are already open get the button without a refresh.

> [!NOTE]
> Firefox removes an add-on loaded this way when it closes. That is how Firefox treats every temporary add-on. Repeat steps 2 and 3 after a restart.

### From the source

The `extension` folder of this repository is the extension, and it loads in both browsers as it is: choose that folder in Chrome, or the `manifest.json` inside it in Firefox. Chromium browsers then list one harmless error about `background.scripts`; see [Troubleshooting](#troubleshooting).

## Use

1. On a video or a Short, click **Add a comment…** or **Reply**.
2. Click the **GIF** button next to the emoji button.
3. Click a GIF. **It is posted straight away**, there is no preview step.

Anything you typed in the comment box is posted together with the GIF.

The picker opens with Tenor's featured GIFs. To find another one:

- type to search Tenor, or
- paste a Tenor link: a `tenor.com/view/…` page, a `media.tenor.com` file, or a bare Tenor ID.

To keep a GIF, point at it and click the star in its corner. The **★** button next to the search field shows your favorites; click it again to go back to the search. Click a favorite's star to remove it. Favorites are shared by all your YouTube tabs and are still there after a browser restart, in Firefox too, once the add-on is loaded again. Removing the extension from the browser deletes them.

| Key | What it does |
| --- | --- |
| <kbd>Enter</kbd> | In the search field, posts the GIF when the picker shows exactly one, as it does after pasting a link |
| <kbd>Esc</kbd> | Closes the picker |

## Troubleshooting

| What you see | What to do |
| --- | --- |
| No **GIF** button in the comment box | Refresh the YouTube tab. |
| "Not ready in this tab yet" | The tab was open before the install and the extension is still checking that it can post from it. Try again in a few seconds, or refresh the tab. |
| "The page hook is not running" or "The extension was reloaded" | Refresh the YouTube tab. |
| "Press Comment to send the GIF" | YouTube did not send the comment by itself. Press its Comment button. |
| The post fails | Nothing is published and your text stays in the box. Try again. |
| "YouTube does not accept this GIF" | YouTube only takes GIFs that Tenor rates G, its rating for all audiences. The picker leaves the others out, but one can get through when Tenor's ratings cannot be read. Pick a different GIF. |
| "YouTube only takes GIFs that Tenor rates G" | The link you pasted points at a GIF with another rating. Pick a different GIF. |
| "YouTube did not accept this GIF comment" | YouTube turned the comment down without giving a reason. Try another GIF or another video. |
| Search finds nothing in Firefox | Open `about:addons`, select Desktop GIFs, and check under **Permissions** that access to `tenor.com` is on. |
| "Manifest file is missing or unreadable" | The wrong folder was chosen. Choose the folder that has `manifest.json` directly inside it. |
| Chrome, Edge or Brave lists the error `'background.scripts' requires manifest version of 2 or lower` | The extension is installed and works. The message appears when the `extension` folder is loaded from the source; that key is there for Firefox. `desktop-gifs-chromium.zip` does not have it. |
| Clicking **GIF** does nothing in Firefox | Update to 0.1.1 or newer. |

## Limits

- **Unofficial.** This project is not affiliated with YouTube, Google or Tenor. It sends a field that YouTube's desktop site does not use itself, so it can stop working whenever YouTube changes something, and using it is at your own risk under YouTube's Terms of Service.
- **Tenor only.** YouTube's GIF comments take Tenor GIFs, so a GIF file from your computer cannot be posted.
- **G-rated GIFs only.** YouTube turns down every GIF that Tenor does not rate G, so the picker shows only those, and a pasted link to any other GIF is not offered.
- **Search depends on Tenor's website.** Tenor closed its public API in June 2026. Search and ratings come from the API that tenor.com itself uses, with the key its pages carry, and fall back to the results in Tenor's web pages, which have no ratings. Either can break when Tenor changes its site.
- **GIFs only.** Stickers and still images are left out of the results.
- **New comments and replies only.** You cannot add a GIF while editing a comment or writing a channel post.

## How it works

When you pick a GIF, the content script adds a one-time marker to the comment box and presses YouTube's own Comment button. YouTube builds and signs the request as usual. The main-world script catches that request, removes the marker and adds the GIF's Tenor ID. A marker that cannot be turned into a GIF is blocked, so it never appears as comment text.

| File | Runs in | Job |
| --- | --- | --- |
| `src/content.js`, `src/content.css` | YouTube page, isolated world | Adds the GIF button and the picker |
| `src/main.js` | YouTube page, main world | Rewrites the comment request so it carries the GIF |
| `src/sw.js` | Service worker (background script in Firefox) | Fetches G-rated search results from Tenor; on install, adds the two scripts above to YouTube tabs that are already open |
| `desktop-gifs.user.js` (this fork) | Tampermonkey sandbox + page `<script>` or `unsafeWindow` patch | Same three jobs in one file: UI inline, `main.js` as injected page script with `unsafeWindow.fetch` fallback, `sw.js` via `GM_xmlhttpRequest` |

There is no build step and there are no dependencies: the `extension` folder is the extension. `python3 tools/package.py` writes the two release ZIPs, which are that folder with the other browser's background key taken out of the manifest.

## Privacy

- **YouTube and Tenor, nothing else:** `youtube.com`, where it adds the button, and for search `tenor.com` and Tenor's API at `tenor.googleapis.com`.
- **Nothing collected.** No analytics, no account.
- **Favorites stay in your browser.** They are kept in the extension's own local storage and are not sent anywhere.
- **Search goes to Tenor without your cookies**, and GIF previews load from Tenor's media servers.
- **Your YouTube credentials are never read.** YouTube's own page sends the comment.

## License

Copyright (C) 2026 rayytor (original extension); Tampermonkey port by cinovenx.

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, version 3. It is distributed without any warranty. See [LICENSE](LICENSE).
