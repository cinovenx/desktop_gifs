// ==UserScript==
// @name         Desktop GIFs (Tampermonkey Port)
// @namespace    https://github.com/cinovenx/desktop_gifs
// @version      0.1.3.3
// @description  Post Tenor GIFs in YouTube comments and replies from desktop — Tampermonkey port of rayytor/desktop_gifs.
// @author       rayytor (original extension), cinovenx (Tampermonkey port)
// @license      GPL-3.0-only
// @match        https://www.youtube.com/*
// @run-at       document-start
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @grant        GM_info
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @grant        GM_addStyle
// @grant        unsafeWindow
// @connect      tenor.com
// @connect      www.tenor.com
// @connect      tenor.googleapis.com
// @connect      media.tenor.com
// @connect      media1.tenor.com
// @connect      media2.tenor.com
// @connect      media3.tenor.com
// @connect      media4.tenor.com
// @connect      media5.tenor.com
// @updateURL    https://raw.githubusercontent.com/cinovenx/desktop_gifs/main/desktop-gifs.user.js
// @downloadURL  https://raw.githubusercontent.com/cinovenx/desktop_gifs/main/desktop-gifs.user.js
// @supportURL   https://github.com/cinovenx/desktop_gifs/issues
// @homepageURL  https://github.com/cinovenx/desktop_gifs
// ==/UserScript==

/*
 * Desktop GIFs — Tampermonkey port.
 *
 * Original extension by rayytor (GPL-3.0-only):
 *   https://github.com/rayytor/desktop_gifs
 * This file is a single-file userscript port of that extension:
 *   extension/src/content.js  -> UI part below (isolated world, unchanged logic)
 *   extension/src/main.js     -> page hook, injected as a <script> into MAIN world
 *   extension/src/sw.js       -> Tenor API layer, ported to GM_xmlhttpRequest
 *   extension/src/content.css -> injected via GM_addStyle
 *
 * Copyright (C) 2026 rayytor (original), cinovenx (port).
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free
 * Software Foundation, version 3. It is distributed without any warranty.
 * See <https://www.gnu.org/licenses/>.
 */

(function () {
  'use strict';

  // A tab must not end up with two copies (same guard key as the extension,
  // so the extension and this userscript do not double-inject each other).
  if (globalThis.gcfyLoaded) return;
  globalThis.gcfyLoaded = true;

  // ------------------------------------------------------------ compat layer
  //
  // Managers expose grants differently, so every lookup tries three scopes:
  //   1. bare identifiers (`typeof GM_xmlhttpRequest`) — Tampermonkey and
  //      Violentmonkey inject grants as wrapper-scope bindings, which resolve
  //      through the scope chain even when they are NOT globalThis props.
  //      `typeof` on an undeclared name is always safe (never throws).
  //   2. the `GM` namespace object (`GM.xmlHttpRequest`) — Greasemonkey 4+,
  //      FireMonkey, Violentmonkey.
  //   3. globalThis/window property walk — sandboxes that set props only.
  function gmFlat(name) {
    try {
      if (name === 'GM_xmlhttpRequest' && typeof GM_xmlhttpRequest === 'function') return GM_xmlhttpRequest;
      if (name === 'GM_setValue' && typeof GM_setValue === 'function') return GM_setValue;
      if (name === 'GM_getValue' && typeof GM_getValue === 'function') return GM_getValue;
      if (name === 'GM_addValueChangeListener' && typeof GM_addValueChangeListener === 'function') return GM_addValueChangeListener;
      if (name === 'GM_addStyle' && typeof GM_addStyle === 'function') return GM_addStyle;
    } catch (e) { /* fall through to namespace and props below */ }
    return gmProp(name);
  }

  function gmNs() {
    try { if (typeof GM === 'object' && GM !== null) return GM; } catch (e) { /* next */ }
    try { if (typeof GM === 'function') return GM; } catch (e) { /* next */ }
    return gmProp('GM');
  }

  function gmNsFn(nsName) {
    const ns = gmNs();
    if (ns) {
      try {
        if (typeof ns[nsName] === 'function') {
          try { return ns[nsName].bind(ns); } catch (e) { return ns[nsName]; }
        }
      } catch (e) { /* fall through */ }
    }
    return gmProp('GM.' + nsName);
  }

  function gmProp(path) {
    const roots = [];
    try { if (typeof globalThis !== 'undefined' && globalThis) roots.push(globalThis); } catch (e) { /* skip */ }
    try { if (typeof window !== 'undefined' && window && roots.indexOf(window) === -1) roots.push(window); } catch (e) { /* skip */ }
    for (const root of roots) {
      try {
        let obj = root;
        const parts = path.split('.');
        let ok = true;
        for (const p of parts) {
          if (obj == null || (typeof obj[p] !== 'function' && typeof obj[p] !== 'object')) { ok = false; break; }
          obj = obj[p];
        }
        if (ok && typeof obj === 'function') return obj;
      } catch (e) { /* next root */ }
    }
    return null;
  }

  // 'Tampermonkey 5.x' / 'Violentmonkey' / 'Greasemonkey' / ... or 'unknown'.
  // Used in error text so a missing-API report tells us the environment.
  function gmManager() {
    try { if (typeof GM_info === 'object' && GM_info && GM_info.scriptHandler) return String(GM_info.scriptHandler) + (GM_info.version ? ' ' + GM_info.version : ''); } catch (e) { /* next */ }
    try {
      const ns = gmNs();
      if (ns && ns.info && ns.info.scriptHandler) return String(ns.info.scriptHandler);
    } catch (e) { /* next */ }
    try {
      const info = gmProp('GM_info') || gmProp('GM.info');
      if (info && info.scriptHandler) return String(info.scriptHandler);
    } catch (e) { /* unknown */ }
    return 'unknown manager';
  }

  // Cross-origin request API, whichever the manager provides:
  //   GM_xmlhttpRequest  — Tampermonkey, Violentmonkey (callback style)
  //   GM.xmlHttpRequest  — Greasemonkey 4+, Violentmonkey, FireMonkey (promise or callback style)
  //   GM.xmlhttpRequest  — lowercase alias some managers expose
  function gmXhrFn() {
    return gmFlat('GM_xmlhttpRequest')
      || gmNsFn('xmlHttpRequest')
      || gmNsFn('xmlhttpRequest');
  }

  function addStyle(css) {
    try {
      const fn = gmFlat('GM_addStyle') || gmNsFn('addStyle');
      if (fn) return fn(css);
    } catch (e) { /* fall through to manual <style> */ }
    const st = document.createElement('style');
    st.textContent = css;
    const parent = document.documentElement || document.head;
    if (parent) parent.appendChild(st);
    else document.addEventListener('DOMContentLoaded', () => document.head.appendChild(st), { once: true });
  }

  // Cross-origin GET to Tenor. Must go through the manager's XHR API, which
  // bypasses CORS on youtube.com -> tenor.com. A plain fetch() can never work
  // here (Tenor sends no CORS headers), so when no GM XHR API is available we
  // fail with an actionable message instead of a cryptic CORS error.
  function tmGet(url, timeoutMs) {
    timeoutMs = timeoutMs || 20000;
    const xhr = gmXhrFn();
    if (!xhr) {
      return Promise.reject(new Error(
        'No cross-origin request API (script manager: ' + gmManager() + '). ' +
        'Reinstall this script in Tampermonkey (or Violentmonkey) with its ' +
        '@grant/@connect permissions accepted — plain page fetch is blocked by CORS.'));
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      const ok = (res) => {
        if (settled) return;
        settled = true;
        try {
          resolve({
            ok: res.status >= 200 && res.status < 300,
            status: res.status,
            finalUrl: res.finalUrl || url,
            text: () => Promise.resolve(res.responseText),
            json: () => Promise.resolve(JSON.parse(res.responseText)),
          });
        } catch (e) { reject(new Error('Tenor sent an answer that could not be read.')); }
      };
      const fail = (err) => {
        if (settled) return;
        settled = true;
        reject(err instanceof Error ? err : new Error('Network error reaching Tenor.'));
      };
      // Belt and suspenders: some managers ignore the timeout option.
      const timer = setTimeout(() => fail(new Error('Tenor did not answer in time.')), timeoutMs + 5000);
      const done = (fn) => (arg) => { clearTimeout(timer); fn(arg); };
      let ret;
      try {
        ret = xhr({
          method: 'GET',
          url: url,
          anonymous: true,
          timeout: timeoutMs,
          onload: done(ok),
          onerror: done(() => fail(new Error('Network error reaching Tenor.'))),
          ontimeout: done(() => fail(new Error('Tenor did not answer in time.'))),
        });
      } catch (e) { clearTimeout(timer); fail(e); return; }
      // Greasemonkey-style: the call returns a promise instead of (only)
      // firing the callbacks.
      if (ret && typeof ret.then === 'function') {
        ret.then(
          (res) => { clearTimeout(timer); ok(res); },
          (err) => { clearTimeout(timer); fail(err); },
        );
      }
    });
  }

  const FavStore = {
    KEY: 'gcfy_favorites',
    load() {
      try {
        const fn = gmFlat('GM_getValue') || gmNsFn('getValue');
        if (fn) {
          const v = fn(this.KEY, []);
          if (Array.isArray(v)) return v;
        }
      } catch (e) { /* fall through */ }
      try {
        const raw = localStorage.getItem(this.KEY);
        const v = raw ? JSON.parse(raw) : [];
        if (Array.isArray(v)) return v;
      } catch (e) { /* ignore */ }
      return [];
    },
    save(list) {
      let gmOk = false;
      try {
        const fn = gmFlat('GM_setValue') || gmNsFn('setValue');
        if (fn) { fn(this.KEY, list); gmOk = true; }
      } catch (e) { gmOk = false; }
      // Mirror to localStorage as well so a fallback reader still sees it.
      try { localStorage.setItem(this.KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
      return gmOk;
    },
    onChange(cb) {
      try {
        const fn = gmFlat('GM_addValueChangeListener') || gmNsFn('addValueChangeListener');
        if (fn) {
          fn(this.KEY, (key, oldVal, newVal) => cb(newVal));
          return;
        }
      } catch (e) { /* fall through */ }
      window.addEventListener('storage', (e) => {
        if (e.key === FavStore.KEY) {
          try { cb(JSON.parse(e.newValue)); } catch (err) { /* ignore */ }
        }
      });
    },
  };

  // ------------------------------------------------- Tenor layer (from sw.js)

  const TENOR = 'https://tenor.com';
  const TENOR_API = 'https://tenor.googleapis.com/v2';
  const CACHE_TTL_MS = 10 * 60 * 1000;
  const MAX_RESULTS = 50;

  // url -> { time, value }
  const tmCache = new Map();

  async function tmCached(url, load) {
    const hit = tmCache.get(url);
    if (hit && Date.now() - hit.time < CACHE_TTL_MS) return hit.value;
    const value = await load();
    tmCache.set(url, { time: Date.now(), value });
    if (tmCache.size > 40) tmCache.delete(tmCache.keys().next().value);
    return value;
  }

  // A tenor.com page as { store, keys }: the results it shows, and the two
  // values its own scripts send to Tenor's API (null if they cannot be read).
  function tmFetchPage(url) {
    return tmCached(url, async () => {
      const res = await tmGet(url);
      if (!res.ok) throw new Error(res.status === 404 ? 'Tenor could not find that GIF.' : `Tenor returned HTTP ${res.status}.`);
      if (new URL(res.finalUrl).origin !== TENOR) throw new Error('Tenor redirected somewhere unexpected.');
      const html = await res.text();
      const m = html.match(/<script id="store-cache" type="text\/x-cache"[^>]*>([\s\S]*?)<\/script>/);
      if (!m) throw new Error('Tenor changed its page format; search is unavailable.');
      return { store: JSON.parse(m[1]), keys: tmReadKeys(html) };
    });
  }

  // The site's settings are base64 JSON in a second script element.
  function tmReadKeys(html) {
    const m = html.match(/<script id="data" type="text\/x-cache"[^>]*>([\s\S]*?)<\/script>/);
    try {
      const data = JSON.parse(atob(m[1].trim()));
      if (typeof data.API_V2_KEY === 'string' && typeof data.API_V2_CLIENT_KEY === 'string') {
        return { key: data.API_V2_KEY, client_key: data.API_V2_CLIENT_KEY };
      }
    } catch (e) { /* no keys: the callers fall back to the page's own results */ }
    return null;
  }

  // One call to Tenor's API, returning its results array. contentfilter=high
  // asks for G-rated GIFs only.
  async function tmFetchApi(path, params) {
    const { keys } = await tmFetchPage(`${TENOR}/`);
    if (!keys) throw new Error('Tenor changed its page format; ratings are unavailable.');
    const query = new URLSearchParams({ ...keys, contentfilter: 'high', media_filter: 'tinygif,tinywebp,gif', ...params });
    const url = `${TENOR_API}${path}?${query}`;
    return tmCached(url, async () => {
      const res = await tmGet(url);
      if (!res.ok) throw new Error(`Tenor returned HTTP ${res.status}.`);
      const { results } = await res.json();
      if (!Array.isArray(results)) throw new Error('Tenor sent an answer that could not be read.');
      return results;
    });
  }

  // A result without a rating is not held back: YouTube has the last word, and
  // the page hook reports a GIF it turns down.
  const tmRatedG = (r) => typeof r.content_rating !== 'string' || r.content_rating === 'G';

  function tmToGif(r) {
    if (!r || !/^\d{1,20}$/.test(String(r.id)) || !r.media_formats) return null;
    const flags = r.flags || [];
    if (flags.includes('sticker') || flags.includes('static')) return null;
    const f = r.media_formats.tinygif || r.media_formats.tinywebp || r.media_formats.gif;
    if (!f || typeof f.url !== 'string' || !/^https:\/\/media\d*\.tenor\.com\//.test(f.url)) return null;
    const dims = Array.isArray(f.dims) ? f.dims : [];
    return {
      id: String(r.id),
      title: String(r.content_description || r.h1_title || 'GIF').slice(0, 200),
      preview: f.url,
      width: dims[0] || 220,
      height: dims[1] || 124,
    };
  }

  const tmToGifs = (results) => (results || []).map(tmToGif).filter(Boolean).slice(0, MAX_RESULTS);

  async function tmFeatured() {
    try {
      return tmToGifs((await tmFetchApi('/featured', { limit: MAX_RESULTS })).filter(tmRatedG));
    } catch (e) { /* fall back to the page's own list */ }
    const { store } = await tmFetchPage(`${TENOR}/`);
    return tmToGifs(store.gifs && store.gifs.featured && store.gifs.featured.results);
  }

  async function tmSearch(query) {
    const slug = query.trim().toLowerCase().split(/\s+/).filter(Boolean).map(encodeURIComponent).join('-');
    if (!slug) return tmFeatured();
    try {
      return tmToGifs((await tmFetchApi('/search', { q: query.trim(), limit: MAX_RESULTS })).filter(tmRatedG));
    } catch (e) { /* fall back to the search page's own list */ }
    const { store } = await tmFetchPage(`${TENOR}/search/${slug}-gifs`);
    const searches = Object.values((store.universal && store.universal.search) || {});
    return tmToGifs(searches[0] && searches[0].results);
  }

  // Accepts a tenor.com page link, a tenor.com short link, a media.tenor.com
  // file link or a bare numeric ID, and returns the one GIF it points at.
  async function tmResolve(input) {
    const text = input.trim();
    let pageUrl;
    if (/^\d{1,20}$/.test(text)) {
      pageUrl = `${TENOR}/view/x-gif-${text}`;
    } else {
      let url;
      try { url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`); } catch (e) { throw new Error('That is not a Tenor link.'); }
      if (/^media\d*\.tenor\.com$/.test(url.hostname)) {
        const mediaId = url.pathname.split('/').filter(Boolean).find((p) => /^[A-Za-z0-9_-]{16}$/.test(p));
        if (!mediaId) throw new Error('That is not a Tenor GIF link.');
        pageUrl = `${TENOR}/view/x-gif-${tmDecodeMediaId(mediaId)}`;
      } else if (url.hostname === 'tenor.com' || url.hostname === 'www.tenor.com') {
        pageUrl = `${TENOR}${url.pathname}`;
      } else {
        throw new Error('That is not a Tenor link.');
      }
    }
    const { store } = await tmFetchPage(pageUrl);
    const entries = Object.values((store.gifs && store.gifs.byId) || {});
    const gifs = tmToGifs(entries.flatMap((e) => (e && e.results) || []).slice(0, 1));
    if (!gifs.length) throw new Error('That link does not point at a GIF.');
    let rated = [];
    try {
      rated = await tmFetchApi('/posts', { ids: gifs[0].id, contentfilter: 'off' });
    } catch (e) { /* rating unknown: offer the GIF and let YouTube decide */ }
    const post = rated.find((r) => r && String(r.id) === gifs[0].id);
    if (post && !tmRatedG(post)) {
      throw new Error(`YouTube only takes GIFs that Tenor rates G. This one is rated ${post.content_rating}.`);
    }
    return gifs;
  }

  function tmDecodeMediaId(mediaId) {
    const bin = atob(mediaId.slice(0, 11).replace(/-/g, '+').replace(/_/g, '/') + '=');
    let n = 0n;
    for (let i = 0; i < 8; i++) n = (n << 8n) | BigInt(bin.charCodeAt(i));
    return n.toString();
  }

  // Same { ok, gifs } / { ok: false, error } envelope the extension's
  // chrome.runtime.sendMessage used to carry.
  async function tmHandle(msg) {
    try {
      if (!msg || typeof msg !== 'object') throw new Error('Bad request.');
      let gifs;
      if (msg.type === 'featured') gifs = await tmFeatured();
      else if (msg.type === 'search' && typeof msg.query === 'string') gifs = await tmSearch(msg.query);
      else if (msg.type === 'resolve' && typeof msg.input === 'string') gifs = await tmResolve(msg.input);
      else throw new Error('Bad request.');
      return { ok: true, gifs };
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    }
  }

  // --------------------------------------- page hook injection (from main.js)
  //
  // The hook wraps the page's own fetch so a comment request carrying an armed
  // marker is rewritten into a GIF comment. It runs in one of two modes:
  //   (a) injected as a <script> into the page's MAIN world at document-start
  //       (exact upstream semantics), or
  //   (b) executed directly in the userscript sandbox against unsafeWindow
  //       (fallback for pages whose nonce-CSP silently blocks inline scripts,
  //       like YouTube — the script tag appends fine but never executes).
  // Both modes share one realm-independent install flag on the page window.
  // Env-parametrized (W/D/L) so the same source works in either realm; all
  // constructors come from W to stay in the page's realm for instanceof.
  function __gcfyPageHook(W, D, L, forceLive) {
    // A page must not end up with two wrappers.
    if (W.__gcfyHookLoaded) return;
    W.__gcfyHookLoaded = true;

    // Every endpoint a ytd-commentbox can submit to (comments, replies, edits,
    // channel posts). Only the two create endpoints are ever rewritten; a marker
    // heading anywhere else is blocked so it cannot be published as text.
    const API_URL = /\/youtubei\/v1\//;
    const WATCHED_URL = /\/youtubei\/v1\/(comment|backstage)\//;
    const CREATE_URL = /\/youtubei\/v1\/comment\/create_comment(_reply)?(\?|$)/;
    const MARKER = /\[\[gif:(\d{1,20}):([a-z0-9]{8,32})\]\]/;
    const ARM_TTL_MS = 3 * 60 * 1000;

    // nonce -> { id, expires }
    const armed = new Map();

    // At document_start the wrapper is in place before any of YouTube's code.
    // The sandbox fallback installs late (on first GIF click), when the page
    // is long loaded and obviously functional, so it starts live.
    let live = !!forceLive || (D && D.readyState === 'loading');

    const toContent = (msg) => W.postMessage({ gcfy: 'to-content', ...msg }, L.origin);

    W.addEventListener('message', (e) => {
      if (e.source !== W || e.origin !== L.origin) return;
      const msg = e.data;
      if (!msg || msg.gcfy !== 'to-main') return;
      if (msg.type === 'arm' && /^\d{1,20}$/.test(msg.id) && /^[a-z0-9]{8,32}$/.test(msg.nonce)) {
        if (!live) { toContent({ type: 'refused', nonce: msg.nonce }); return; }
        armed.set(msg.nonce, { id: msg.id, expires: Date.now() + ARM_TTL_MS });
        toContent({ type: 'armed', nonce: msg.nonce });
      } else if (msg.type === 'disarm') {
        armed.delete(msg.nonce);
      }
    });

    async function readBody(input, init) {
      const isRequest = input instanceof W.Request;
      const headers = new W.Headers(isRequest ? input.headers : (init && init.headers) || {});
      let buf;
      if (isRequest) buf = await input.clone().arrayBuffer();
      else if (init && init.body != null) buf = await new W.Response(init.body).arrayBuffer();
      else return null;
      // YouTube gzips request bodies between 500 bytes and 500 kB.
      const text = headers.get('content-encoding') === 'gzip'
        ? await new W.Response(new W.Blob([buf]).stream().pipeThrough(new W.DecompressionStream('gzip'))).text()
        : new W.TextDecoder().decode(buf);
      return { headers, text };
    }

    const originalFetch = W.fetch;

    W.fetch = function (input, init) {
      let url = '';
      try {
        url = typeof input === 'string' ? input : input instanceof W.Request ? input.url : String(input);
      } catch (e) { /* fall through to the original fetch */ }
      if (!live && API_URL.test(url)) live = true;
      if (!WATCHED_URL.test(url)) return originalFetch.apply(this, arguments);
      return handleWatched.call(this, url, input, init, arguments);
    };

    async function handleWatched(url, input, init, originalArgs) {
      let parsed = null;
      try {
        parsed = await readBody(input, init);
      } catch (e) { /* a body we cannot read: leave the request alone */ }

      const match = parsed && parsed.text.match(MARKER);
      if (!match) return originalFetch.apply(this, originalArgs);

      // From here on a marker is present, so the original request must never be
      // sent: it would publish the marker as visible text.
      const [whole, id, nonce] = match;
      const entry = armed.get(nonce);
      armed.delete(nonce);

      let body = null;
      try { body = JSON.parse(parsed.text); } catch (e) { /* handled below */ }
      // The marker sits at the very end of the comment; anything before it is
      // the user's own text and is posted alongside the GIF.
      const full = body && typeof body.commentText === 'string' ? body.commentText.trim() : '';
      const ownText = full.endsWith(whole) ? full.slice(0, -whole.length).trim() : null;
      const valid = body && CREATE_URL.test(url)
        && ownText !== null && !MARKER.test(ownText)
        && entry && entry.id === id && entry.expires >= Date.now();
      if (!valid) {
        toContent({ type: 'result', nonce, ok: false, error: 'This box cannot take a GIF, or the request expired. Nothing was posted.' });
        throw new TypeError('GIF comment marker blocked');
      }

      toContent({ type: 'seen', nonce });
      let response;
      try {
        if (ownText) body.commentText = ownText;
        else delete body.commentText;
        body.tenorId = id;
        const headers = parsed.headers;
        headers.delete('content-encoding');
        const payload = JSON.stringify(body);
        response = input instanceof W.Request
          ? await originalFetch.call(this, new W.Request(input, { body: payload, headers }))
          : await originalFetch.call(this, input, { ...init, body: payload, headers });
      } catch (e) {
        toContent({ type: 'result', nonce, ok: false, error: 'The request could not be sent. Nothing was posted.' });
        throw e;
      }

      try {
        const json = await response.clone().json();
        const ok = response.ok && !!json.actionResult && json.actionResult.status === 'STATUS_SUCCEEDED';
        const feedback = json.actionResult && json.actionResult.feedbackText && json.actionResult.feedbackText.runs
          ? json.actionResult.feedbackText.runs.map((r) => r.text).join('')
          : '';
        // YouTube only takes GIFs that Tenor rates G. For any other GIF a reply
        // gets HTTP 400 INVALID_ARGUMENT, and a comment gets HTTP 200 with a
        // showErrorAction where the actionResult would be.
        const refused = response.ok ? !json.actionResult : !!json.error && json.error.status === 'INVALID_ARGUMENT';
        const fallback = response.ok ? 'YouTube did not accept this GIF comment. Nothing was posted.' : `YouTube returned HTTP ${response.status}.`;
        const error = ok ? null
          : refused ? 'YouTube does not accept this GIF. Try a different one. Nothing was posted.'
          : (json.error && json.error.message) || feedback || fallback;
        toContent({ type: 'result', nonce, ok, error });
      } catch (e) {
        toContent({ type: 'result', nonce, ok: response.ok, error: response.ok ? null : `YouTube returned HTTP ${response.status}.` });
      }
      return response;
    }
  }

  function hookPresent() {
    try { return !!window.__gcfyHookLoaded || !!gmUnsafeWindow().__gcfyHookLoaded; }
    catch (e) { return false; }
  }

  function gmUnsafeWindow() {
    try { if (typeof unsafeWindow !== 'undefined' && unsafeWindow) return unsafeWindow; } catch (e) { /* no grant */ }
    return null;
  }

  // Installs the fetch wrapper right where the page will call it. Preferred
  // mode is the document-start <script> injection below; this is the fallback
  // for CSP-blocked injection, run lazily on first GIF click.
  function ensureHook() {
    if (hookPresent()) return true;
    const uw = gmUnsafeWindow();
    if (!uw) return false;
    try {
      if (!uw.__gcfyHookLoaded) __gcfyPageHook(uw, document, location, true);
    } catch (e) { /* sandbox could not patch the page; state below decides */ }
    return hookPresent();
  }

  function injectPageHook() {
    const src = '(' + __gcfyPageHook.toString() + ')(window,document,location);';
    try {
      const el = document.createElement('script');
      // Pages enforcing Trusted Types reject a plain string here; mint a
      // pass-through policy when the API exists and the page allows it.
      let code = src;
      try {
        if (window.trustedTypes && window.trustedTypes.createPolicy && !injectPageHook._policy) {
          injectPageHook._policy = window.trustedTypes.createPolicy('gcfy-hook', { createScript: (s) => s });
        }
        if (injectPageHook._policy) code = injectPageHook._policy.createScript(src);
      } catch (e) { code = src; }
      el.textContent = code;
      const parent = document.documentElement || document.head;
      if (parent) {
        parent.appendChild(el);
        el.remove();
        return true;
      }
    } catch (e) { /* CSP/TT blocked or no root yet: retry below */ }
    return false;
  }

  if (!hookPresent() && !injectPageHook()) {
    const obs = new MutationObserver(() => {
      if (hookPresent()) { try { obs.disconnect(); } catch (e) { /* ignore */ } return; }
      if (injectPageHook()) try { obs.disconnect(); } catch (e) { /* ignore */ }
    });
    try { obs.observe(document, { childList: true, subtree: true }); } catch (e) { /* ignore */ }
    document.addEventListener('DOMContentLoaded', () => {
      if (!hookPresent()) injectPageHook();
      try { obs.disconnect(); } catch (e) { /* ignore */ }
    }, { once: true });
  }

  // -------------------------------------------------- button CSS (content.css)
  addStyle(`
.gcfy-btn {
  flex: none;
  align-self: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #0f0f0f;
  cursor: pointer;
}
html[dark] .gcfy-btn { color: #f1f1f1; }
.gcfy-btn::before {
  --gcfy-icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23fff' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='2' y='5.5' width='20' height='13' rx='3.5' stroke-width='1.5'/%3E%3Cpath stroke-width='1.25' d='M9.85 10.35C9.45 9.75 8.9 9.4 8.25 9.4c-1.1 0-1.8 1.05-1.8 2.6s.7 2.6 1.8 2.6 1.8-.75 1.8-1.9v-.4H8.5M12.35 9.4v5.2M14.65 14.6V9.4h2.9M14.65 12.15H17'/%3E%3C/svg%3E");
  content: "";
  width: 24px;
  height: 24px;
  background-color: currentColor;
  -webkit-mask: var(--gcfy-icon) center / contain no-repeat;
  mask: var(--gcfy-icon) center / contain no-repeat;
}
.gcfy-btn:hover,
.gcfy-btn[aria-expanded="true"] { background: rgba(0, 0, 0, 0.05); }
html[dark] .gcfy-btn:hover,
html[dark] .gcfy-btn[aria-expanded="true"] { background: rgba(255, 255, 255, 0.1); }
.gcfy-btn:focus-visible { outline: 2px solid #065fd4; outline-offset: 2px; }
html[dark] .gcfy-btn:focus-visible { outline-color: #3ea6ff; }
`);

  // -------------------------------------------------------- UI (from content.js)

  const BOX_SCOPE = 'ytd-comment-simplebox-renderer, ytd-comment-thread-renderer';
  const POST_DIALOG = 'ytd-backstage-post-dialog-renderer';
  const PICKER_W = 340;
  const PICKER_H = 420;
  const SEARCH_DEBOUNCE_MS = 350;
  const ARM_TIMEOUT_MS = 1500;
  const AUTO_SUBMIT_GRACE_MS = 4000;
  const RESULT_TIMEOUT_MS = 20000;
  const NO_FAVORITES = 'No favorites yet. Point at a GIF and click its star.';

  const PICKER_CSS = `
    :host { all: initial; position: fixed; z-index: 2147483647; }
    .panel {
      --bg: #fff; --fg: #0f0f0f; --muted: #606060; --line: rgba(0,0,0,.12); --field: rgba(0,0,0,.05); --accent: #065fd4; --err: #c00;
      --thumb: rgba(0,0,0,.25); --thumb-hover: rgba(0,0,0,.45);
      box-sizing: border-box; display: flex; flex-direction: column;
      width: ${PICKER_W}px; background: var(--bg); color: var(--fg);
      border: 1px solid var(--line); border-radius: 12px; overflow: hidden;
      box-shadow: 0 8px 28px rgba(0,0,0,.35);
      font: 13px/1.4 Roboto, Arial, sans-serif;
    }
    .panel[data-dark] {
      --bg: #212121; --fg: #f1f1f1; --muted: #aaa; --line: rgba(255,255,255,.14); --field: rgba(255,255,255,.08); --accent: #3ea6ff; --err: #ff7b7b;
      --thumb: rgba(255,255,255,.25); --thumb-hover: rgba(255,255,255,.45);
    }
    .search { flex: none; display: flex; gap: 6px; padding: 8px; border-bottom: 1px solid var(--line); }
    input {
      box-sizing: border-box; flex: 1; min-width: 0; height: 34px; padding: 0 12px;
      border: 1px solid transparent; border-radius: 17px; outline: none;
      background: var(--field); color: var(--fg); font: inherit;
    }
    input:focus { border-color: var(--accent); }
    input::placeholder { color: var(--muted); }
    .fav-tab {
      flex: none; width: 34px; height: 34px; padding: 0; border: 0; border-radius: 50%;
      background: var(--field); color: var(--muted); font: 16px/1 Arial, sans-serif; cursor: pointer;
    }
    .fav-tab[aria-pressed="true"] { background: var(--accent); color: var(--bg); }
    .fav-tab:focus-visible, .star:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
    .status { flex: none; padding: 6px 12px 0; color: var(--muted); }
    .status:empty { display: none; }
    .status[data-kind="error"] { color: var(--err); }
    .grid {
      flex: 1; min-height: 0; overflow-x: hidden; overflow-y: auto; padding: 8px 2px 8px 8px;
      display: flex; align-items: flex-start; gap: 6px;
      scrollbar-gutter: stable;
    }
    .grid::-webkit-scrollbar { width: 12px; }
    .grid::-webkit-scrollbar-track { background: transparent; }
    .grid::-webkit-scrollbar-thumb {
      border: 3px solid transparent; border-radius: 6px;
      background: var(--thumb); background-clip: content-box;
    }
    .grid::-webkit-scrollbar-thumb:hover { background: var(--thumb-hover); background-clip: content-box; }
    @supports not selector(::-webkit-scrollbar) {
      .grid { scrollbar-width: thin; scrollbar-color: var(--thumb) transparent; padding-right: 8px; }
    }
    .col { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
    .tile {
      display: block; width: 100%; margin: 0; padding: 0; border: 0; border-radius: 8px;
      overflow: hidden; background: var(--field); cursor: pointer;
    }
    .tile:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
    .tile:hover img { opacity: .82; }
    .tile img { display: block; width: 100%; height: auto; }
    .cell { position: relative; }
    .star {
      position: absolute; top: 4px; right: 4px; width: 26px; height: 26px; padding: 0; border: 0; border-radius: 50%;
      background: rgba(0,0,0,.6); color: #fff; font: 16px/1 Arial, sans-serif; cursor: pointer; opacity: 0;
    }
    .cell:hover .star, .star:focus-visible, .star[aria-pressed="true"] { opacity: 1; }
    .star[aria-pressed="true"] { color: #ffd45c; }
    .panel[data-busy] .cell { pointer-events: none; opacity: .45; }
  `;

  // ---------------------------------------------------------------- page hook

  const fromMain = new Map(); // nonce -> callback(msg)

  window.addEventListener('message', (e) => {
    // In fallback mode the hook lives on unsafeWindow; its replies may carry
    // that wrapper as source instead of this world's window. Same-origin and
    // the per-click armed nonce gate the protocol either way.
    if (e.source !== window && e.source !== gmUnsafeWindow()) return;
    if (e.origin !== location.origin) return;
    const msg = e.data;
    if (!msg || msg.gcfy !== 'to-content' || typeof msg.nonce !== 'string') return;
    const cb = fromMain.get(msg.nonce);
    if (cb) cb(msg);
  });

  let fallbackActive = false;
  const toMain = (msg) => {
    // Post through the same window object the hook listens on, so its
    // `e.source !== W` check passes trivially in either mode.
    const target = (fallbackActive && gmUnsafeWindow()) || window;
    target.postMessage({ gcfy: 'to-main', ...msg }, location.origin);
  };

  function newNonce() {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // ------------------------------------------------------------- GIF buttons

  function addButton(box) {
    if (box.querySelector('.gcfy-btn')) return;
    if (!box.closest(BOX_SCOPE) || box.closest(POST_DIALOG)) return;
    const footer = box.querySelector('#footer');
    if (!footer) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gcfy-btn';
    btn.title = 'Add a GIF';
    btn.setAttribute('aria-label', 'Add a GIF');
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (picker.open && picker.anchor === btn) closePicker();
      else openPicker(btn, box);
    });
    const emoji = footer.querySelector('#emoji-button');
    if (emoji && emoji.parentElement === footer) emoji.after(btn);
    else footer.prepend(btn);
  }

  let scanQueued = false;
  function scan() {
    scanQueued = false;
    for (const box of document.querySelectorAll('ytd-commentbox')) addButton(box);
  }
  new MutationObserver(() => {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(scan);
  }).observe(document.documentElement, { childList: true, subtree: true });
  // Comment boxes that are already there when this file is injected late.
  scan();

  // ------------------------------------------------------------------ picker

  const picker = { open: false, busy: false, host: null, anchor: null, box: null, els: null, seq: 0, timer: 0, gifs: [], nonce: null, favorites: [], showingFavorites: false };

  function buildPicker() {
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = PICKER_CSS;

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Choose a GIF');

    const search = document.createElement('div');
    search.className = 'search';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Search Tenor or paste a Tenor link';
    input.setAttribute('aria-label', 'Search Tenor or paste a Tenor link');
    input.autocomplete = 'off';
    input.spellcheck = false;
    const favTab = document.createElement('button');
    favTab.type = 'button';
    favTab.className = 'fav-tab';
    favTab.textContent = '★';
    favTab.title = 'Favorites';
    favTab.setAttribute('aria-label', 'Favorites');
    favTab.setAttribute('aria-pressed', 'false');
    search.append(input, favTab);

    const status = document.createElement('div');
    status.className = 'status';
    status.setAttribute('role', 'status');

    const grid = document.createElement('div');
    grid.className = 'grid';

    panel.append(search, status, grid);
    root.append(style, panel);

    input.addEventListener('input', () => {
      clearTimeout(picker.timer);
      picker.timer = setTimeout(() => load(input.value), SEARCH_DEBOUNCE_MS);
    });
    favTab.addEventListener('click', () => {
      if (picker.showingFavorites) { load(input.value); return; }
      // A search that is waiting or under way must not replace the favorites.
      clearTimeout(picker.timer);
      picker.seq++;
      setFavoritesView(true);
      renderFavorites(false);
    });
    grid.addEventListener('click', (e) => {
      const star = e.target.closest('.star');
      const tile = e.target.closest('.tile');
      if (star) toggleFavorite(picker.gifs[Number(star.dataset.index)]);
      else if (tile && !picker.busy) send(picker.gifs[Number(tile.dataset.index)]);
    });

    picker.host = host;
    picker.els = { panel, input, status, grid, favTab };
  }

  function setStatus(text, kind) {
    picker.els.status.textContent = text || '';
    if (kind) picker.els.status.dataset.kind = kind;
    else delete picker.els.status.dataset.kind;
  }

  function setBusy(busy) {
    picker.busy = busy;
    picker.els.panel.toggleAttribute('data-busy', busy);
  }

  function place() {
    if (!picker.open) return;
    if (!picker.anchor.isConnected) { closePicker(); return; }
    const r = picker.anchor.getBoundingClientRect();
    const h = Math.min(PICKER_H, innerHeight - 16);
    picker.els.panel.style.height = `${h}px`;
    let top = r.top - h - 8;
    if (top < 8) top = Math.min(r.bottom + 8, innerHeight - h - 8);
    const left = Math.min(Math.max(8, r.left), innerWidth - PICKER_W - 8);
    picker.host.style.top = `${Math.max(8, top)}px`;
    picker.host.style.left = `${Math.max(8, left)}px`;
  }

  function openPicker(anchor, box) {
    if (!picker.host) buildPicker();
    if (picker.open) closePicker();
    picker.open = true;
    picker.anchor = anchor;
    picker.box = box;
    anchor.setAttribute('aria-expanded', 'true');
    picker.els.panel.toggleAttribute('data-dark', document.documentElement.hasAttribute('dark'));
    document.documentElement.append(picker.host);
    setBusy(false);
    place();
    picker.els.input.focus();
    load(picker.els.input.value);
  }

  function closePicker() {
    if (!picker.open) return;
    picker.open = false;
    clearTimeout(picker.timer);
    picker.seq++;
    picker.anchor.setAttribute('aria-expanded', 'false');
    picker.host.remove();
    if (picker.anchor.isConnected && !picker.busy) picker.anchor.focus();
  }

  const looksLikeLink = (text) => /^\d{6,20}$/.test(text) || /^(https?:\/\/)?([\w-]+\.)*tenor\.com\//i.test(text);

  async function load(raw) {
    const text = raw.trim();
    const seq = ++picker.seq;
    setFavoritesView(false);
    setStatus(text ? 'Searching…' : 'Loading…');
    // Tampermonkey port: no background worker — call the Tenor layer directly.
    const reply = await tmHandle(
      !text ? { type: 'featured' } : looksLikeLink(text) ? { type: 'resolve', input: text } : { type: 'search', query: text },
    );
    if (seq !== picker.seq || !picker.open) return;
    if (!reply || !reply.ok) {
      render([]);
      setStatus((reply && reply.error) || 'Tenor could not be reached.', 'error');
      return;
    }
    render(reply.gifs);
    setStatus(reply.gifs.length ? '' : 'No GIFs found.');
  }

  function render(gifs) {
    picker.gifs = gifs;
    // Two columns that grow downwards; each GIF goes into the shorter one.
    const cols = [0, 1].map(() => {
      const col = document.createElement('div');
      col.className = 'col';
      return { el: col, height: 0 };
    });
    gifs.forEach((gif, i) => {
      const cell = document.createElement('div');
      cell.className = 'cell';
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'tile';
      tile.dataset.index = String(i);
      tile.title = gif.title;
      const img = document.createElement('img');
      img.src = gif.preview;
      img.alt = gif.title;
      img.width = gif.width;
      img.height = gif.height;
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      tile.append(img);
      const star = document.createElement('button');
      star.type = 'button';
      star.className = 'star';
      star.dataset.index = String(i);
      setStar(star, gif);
      cell.append(tile, star);
      const col = cols[0].height <= cols[1].height ? cols[0] : cols[1];
      col.el.append(cell);
      col.height += gif.height / gif.width;
    });
    picker.els.grid.replaceChildren(...cols.map((c) => c.el));
    picker.els.grid.scrollTop = 0;
  }

  // --------------------------------------------------------------- favorites

  function setFavoritesView(on) {
    picker.showingFavorites = on;
    picker.els.favTab.setAttribute('aria-pressed', String(on));
  }

  function setStar(star, gif) {
    const on = picker.favorites.some((f) => f.id === gif.id);
    star.textContent = on ? '★' : '☆';
    star.title = on ? 'Remove from favorites' : 'Add to favorites';
    star.setAttribute('aria-label', star.title);
    star.setAttribute('aria-pressed', String(on));
  }

  function renderFavorites(keepScroll) {
    const top = keepScroll ? picker.els.grid.scrollTop : 0;
    render(picker.favorites);
    picker.els.grid.scrollTop = top;
    setStatus(picker.favorites.length ? '' : NO_FAVORITES);
  }

  // Takes the stored list, on load and whenever any tab changes it, so every
  // tab works on the same list and none writes back an old copy.
  function useFavorites(stored) {
    picker.favorites = (Array.isArray(stored) ? stored : []).filter((g) => g
      && typeof g.id === 'string' && typeof g.title === 'string' && typeof g.preview === 'string'
      && g.width > 0 && g.height > 0);
    if (!picker.open || picker.busy) return;
    if (picker.showingFavorites) renderFavorites(true);
    else for (const star of picker.els.grid.querySelectorAll('.star')) setStar(star, picker.gifs[Number(star.dataset.index)]);
  }

  // Tampermonkey port: GM storage (+ localStorage mirror) instead of chrome.storage.
  useFavorites(FavStore.load());
  FavStore.onChange((stored) => useFavorites(stored));

  // Only writes the list; the change listener above then shows it, here and
  // in every other tab (GM_addValueChangeListener fires cross-tab).
  async function toggleFavorite(gif) {
    const rest = picker.favorites.filter((f) => f.id !== gif.id);
    const next = rest.length < picker.favorites.length ? rest : [gif, ...rest];
    try {
      FavStore.save(next);
      // GM_addValueChangeListener does not always fire in the same tab —
      // update this tab immediately too.
      useFavorites(next);
    } catch (e) {
      setStatus('The favorite could not be saved. Refresh this page.', 'error');
    }
  }

  // ----------------------------------------------------------------- posting

  function selectRange(editor, range) {
    editor.focus();
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // Adds the marker after whatever the user has typed, leaving their text
  // (and any emoji or mentions in it) as it is.
  function appendMarker(editor, marker) {
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selectRange(editor, range);
    let done = false;
    try { done = document.execCommand('insertText', false, marker); } catch (e) { /* fall back below */ }
    if (!done || !editor.textContent.includes(marker)) {
      editor.append(document.createTextNode(marker));
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: marker }));
    }
  }

  function removeMarker(editor, marker) {
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.data.indexOf(marker);
      if (at === -1) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + marker.length);
      selectRange(editor, range);
      let done = false;
      try { done = document.execCommand('delete', false); } catch (e) { /* fall back below */ }
      if (!done || editor.textContent.includes(marker)) {
        node.data = node.data.replace(marker, '');
        editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
      }
      return;
    }
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function send(gif) {
    const box = picker.box;
    const editor = box && box.isConnected && box.querySelector('#contenteditable-root');
    const submit = box && box.querySelector('#submit-button button');
    if (!editor || !submit) {
      setStatus('The comment box was closed. Open it and try again.', 'error');
      return;
    }

    const nonce = newNonce();
    const marker = `[[gif:${gif.id}:${nonce}]]`;
    let settle;
    const settled = new Promise((resolve) => { settle = resolve; });
    let armedAck;
    const armedPromise = new Promise((resolve) => { armedAck = resolve; });
    let seen = false;
    fromMain.set(nonce, (msg) => {
      if (msg.type === 'armed') armedAck(true);
      else if (msg.type === 'refused') armedAck('refused');
      else if (msg.type === 'seen') seen = true;
      else if (msg.type === 'result') settle(msg);
    });

    setBusy(true);
    setStatus('Posting…');
    try {
      // The document-start <script> injection is silently dropped on pages
      // with a strict nonce-CSP; in that case patch the page fetch directly.
      fallbackActive = !hookPresent() && !!gmUnsafeWindow() && ensureHook() && !window.__gcfyHookLoaded;
      if (!hookPresent()) {
        setStatus(gmUnsafeWindow()
          ? 'The page hook could not be installed. Refresh this page and try again.'
          : 'The page hook is not running (no unsafeWindow grant). Reinstall the script accepting its permissions, then refresh this page.', 'error');
        return;
      }
      toMain({ type: 'arm', id: gif.id, nonce });
      // Without the page hook the marker would be posted as plain text, so
      // nothing is typed into the box until the hook has answered.
      const armed = await Promise.race([armedPromise, sleep(ARM_TIMEOUT_MS).then(() => false)]);
      if (armed !== true) {
        setStatus(armed === 'refused'
          ? 'Not ready in this tab yet. Try again in a few seconds, or refresh this page.'
          : 'The page hook is installed but did not answer (manager: ' + gmManager() + '). Refresh this page and try again.', 'error');
        return;
      }

      appendMarker(editor, marker);
      for (let i = 0; i < 20 && submit.disabled; i++) await sleep(50);
      submit.click();

      let result = await Promise.race([settled, sleep(AUTO_SUBMIT_GRACE_MS).then(() => null)]);
      if (!result && !seen) {
        const label = (submit.getAttribute('aria-label') || submit.textContent || 'Comment').trim();
        setStatus(`Press ${label} to send the GIF.`);
      }
      if (!result) result = await Promise.race([settled, sleep(RESULT_TIMEOUT_MS).then(() => null)]);

      if (result && result.ok) {
        setBusy(false);
        closePicker();
        return;
      }
      // Failed or never sent: take the marker back out of the box.
      toMain({ type: 'disarm', nonce });
      if (editor.isConnected) removeMarker(editor, marker);
      setStatus((result && result.error) || 'The GIF was not sent. Nothing was posted.', 'error');
    } finally {
      fromMain.delete(nonce);
      setBusy(false);
    }
  }

  // ------------------------------------------------------- page interactions

  const inPicker = (e) => picker.open && e.composedPath().includes(picker.host);

  // Registered at document_start in the capture phase, ahead of YouTube's own
  // handlers, so typing in the search field does not trigger player shortcuts
  // and scrolling the grid does not flip to the next Short.
  for (const type of ['keydown', 'keyup', 'keypress']) {
    window.addEventListener(type, (e) => {
      if (!inPicker(e)) return;
      e.stopImmediatePropagation();
      if (type !== 'keydown') return;
      if (e.key === 'Escape') {
        e.preventDefault();
        closePicker();
      } else if (e.key === 'Enter' && e.composedPath()[0] === picker.els.input && picker.gifs.length === 1 && !picker.busy) {
        e.preventDefault();
        send(picker.gifs[0]);
      }
    }, true);
  }
  window.addEventListener('wheel', (e) => { if (inPicker(e)) e.stopImmediatePropagation(); }, { capture: true, passive: true });

  window.addEventListener('pointerdown', (e) => {
    if (!picker.open || picker.busy) return;
    const path = e.composedPath();
    if (!path.includes(picker.host) && !path.includes(picker.anchor)) closePicker();
  }, true);

  let placeQueued = false;
  const queuePlace = () => {
    if (!picker.open || placeQueued) return;
    placeQueued = true;
    requestAnimationFrame(() => { placeQueued = false; place(); });
  };
  window.addEventListener('scroll', queuePlace, { capture: true, passive: true });
  window.addEventListener('resize', queuePlace, { passive: true });
  window.addEventListener('yt-navigate-start', () => { if (!picker.busy) closePicker(); });
})();
