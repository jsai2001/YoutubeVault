# Design: YouTube Link Vault (static, Firebase-backed, Netlify-deployable)

## Overview

This is a single-page static site with no build step: `index.html`, `styles.css`, and `app.js` served as-is by Netlify. Firebase is loaded entirely via CDN ES module imports (Firebase JS SDK v10.x, the modular/tree-shakeable API), so there is no `npm install`, no bundler, and no `node_modules` — the three source files plus `firestore.rules` and `netlify.toml` are the entire deployable artifact. All persistent state (the links themselves) lives in a single Firestore collection, `links`, read and written directly from the browser with the Firebase Web SDK. Every open tab/device subscribes to that collection with `onSnapshot`, so an add or remove on one device re-renders the grid on all others within the latency of a Firestore push, which is what satisfies the "stay in sync across devices" requirement without writing any server code. Visually the app is a deliberate YouTube look-alike: same dark palette, same header/sidebar/grid skeleton, same card anatomy, so the "best lookalike as possible" requirement is treated as a first-class deliverable, not a skin on a generic layout.

## Technology stack (locked)

- HTML5 + CSS3 (CSS Grid/Flexbox, CSS custom properties for the theme) + vanilla ES2022 JavaScript (ES modules, no transpilation).
- Firebase JS SDK v10.x (latest 10.x patch at implementation time), imported directly from `https://www.gstatic.com/firebasejs/10.x.x/firebase-app.js` and `firebase-firestore.js` as ES modules. No `firebase-analytics.js`, no `firebase-auth.js`.
- Firestore in Native mode as the only backend/data store.
- Google Fonts `Roboto` (400/500/700) loaded via `<link>` in `<head>`, matching YouTube's actual typeface.
- No npm, no package.json, no bundler, no framework (no React/Vue). No YouTube Data API key and no call to any `googleapis.com/youtube/v3` endpoint, anywhere, ever.
- Hosting target: Netlify, as a plain static site (publish directory = repo root).

## File layout

```
/index.html        - single HTML page: header, sidebar, grid container, modal templates
/styles.css         - full visual design system (theme tokens, layout, components, responsive rules)
/app.js             - Firebase init, Firestore CRUD + onSnapshot, UI rendering, add/remove/filter/search logic
/firestore.rules    - security rules scoped to the `links` collection only
/netlify.toml       - build config (no build command; publish = ".")
/README.md          - updated with what this project is, how to deploy, how Firestore is structured
```

No other files are needed. `app.js` is a single module (not split further) because the app's logic is small enough (parsing, fetch-with-fallback, CRUD, render, filter) that extra files would add indirection without benefit; functions inside it are grouped by concern (see "app.js structure" below) so it stays navigable.

## Firebase initialization (app.js, top of file)

```js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getFirestore, collection, addDoc, deleteDoc, doc,
  onSnapshot, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDaaVHzL02tsIRBhCqmVXjxfpsVylyLpYA",
  authDomain: "vault-dd939.firebaseapp.com",
  projectId: "vault-dd939",
  storageBucket: "vault-dd939.firebasestorage.app",
  messagingSenderId: "575094649019",
  appId: "1:575094649019:web:401833b4933965e64fb99e"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const linksRef = collection(db, "links");
```

`measurementId` is intentionally omitted from the object and `firebase-analytics.js` is never imported — there is no tracking in this app. This config is the one the user pasted from the Firebase console; it is the public web config Firebase explicitly designs to be embedded client-side (it is not a secret — it identifies the project to Google's servers, it does not grant access by itself). Access control is enforced entirely by `firestore.rules`, not by hiding this object, so pinning it directly in `app.js` is correct and matches Firebase's own guidance.

## Visual design system (styles.css)

### Theme tokens

Defined as CSS custom properties on `:root` so every component reads from the same palette (this also makes a future light-theme toggle cheap, even though one isn't required now):

```css
:root {
  --yt-bg: #0f0f0f;
  --yt-surface: #212121;
  --yt-surface-hover: #3f3f3f;
  --yt-border: #3f3f3f;
  --yt-text-primary: #ffffff;
  --yt-text-secondary: #aaaaaa;
  --yt-accent: #ff0000;
  --yt-accent-hover: #cc0000;
  --yt-radius-card: 12px;
  --yt-radius-pill: 18px;
  --yt-header-height: 56px;
  --yt-sidebar-width: 240px;
  --yt-sidebar-width-collapsed: 72px;
  --font-main: "Roboto", "Arial", sans-serif;
}
```

`body { background: var(--yt-bg); color: var(--yt-text-primary); font-family: var(--font-main); }`. Secondary text (channel name, category pill, meta) uses `var(--yt-text-secondary)` at a slightly smaller size, mirroring how YouTube visually separates title from metadata.

### Header (fixed, 56px, matches YouTube's real header height)

Three-zone flex layout, `position: sticky; top: 0; z-index: 100; background: var(--yt-bg); border-bottom: 1px solid var(--yt-border);`:

- **Left zone**: hamburger icon button (toggles sidebar collapse on desktop, toggles an overlay drawer on mobile) + the app logotype. The logo reuses YouTube's visual trick: a red rounded-rect "play" glyph next to a bold wordmark — here rendered as "**Vault**" in white with a small red play-triangle icon (inline SVG), not an actual YouTube logo (avoids trademark lookalike-abuse while keeping the same visual grammar: icon + wordmark, left-aligned, 500 weight).
- **Center zone**: search input, `max-width: 640px`, pill-shaped (`border-radius: var(--yt-radius-pill)`), dark surface, search icon button on its right edge styled as the lighter-gray YouTube search button. `flex: 1 1 auto` so it grows/shrinks but is capped.
- **Right zone**: a single prominent "Add link" button — pill-shaped, `var(--yt-surface)` background with a `+` icon, text "Add", hover transitions to `var(--yt-surface-hover)`. This is the one place the UI intentionally diverges from literal YouTube (which has an upload icon) because the core user action here is "add a link," so it gets a labeled button rather than an icon-only affordance, for discoverability.

### Sidebar (left, 240px expanded / 72px icon-only collapsed)

Fixed under the header (`top: var(--yt-header-height)`, `height: calc(100vh - var(--yt-header-height))`, `overflow-y: auto`). Contains:

- A "Home" / "All" entry (clears category filter), highlighted with a left-border accent + subtle `var(--yt-surface)` background when active — same selected-state treatment YouTube uses.
- One entry per category in the fixed preset list, each with a small inline SVG icon chosen for quick visual association (e.g. a musical note for Music, a controller for Gaming, a cap for Education, a wrench/chip for Tech, a mask for Comedy, a ball for Sports, a newspaper for News, a utensil for Cooking, a compass for Travel, a dumbbell for Fitness, a clapperboard for Movies/TV, a tag for Other) + the category label. Clicking sets the active category filter.
- Collapsed state (icon-only, labels hidden via `width` transition + `white-space: nowrap`/`overflow: hidden` on the label span) is the default between the tablet and mobile breakpoints (see the breakpoint scale below) and toggleable on desktop via the hamburger button, exactly like YouTube's own collapse behavior.
- Below the mobile breakpoint the sidebar becomes a full-height slide-in overlay drawer (`position: fixed; transform: translateX(-100%)`, toggled to `translateX(0)`) with a semi-transparent backdrop, rather than pushing content, since there's no room to dock it.

#### Breakpoint scale (single source of truth)

Three named breakpoints, defined once as a comment block at the top of `styles.css` and referenced by name in every media query below, so there is one canonical set of numbers rather than ad hoc thresholds scattered per component:

| Name | Max-width | Sidebar | Header search | Grid columns (via `auto-fill`, not hard-coded) |
|---|---|---|---|---|
| Desktop (default, no query needed) | `> 1024px` | Expanded (240px) by default, user-collapsible to icon-only (72px) via hamburger | Full pill input, `max-width: 640px` | 4+ (viewport-width ÷ ~292px card+gap) |
| Tablet | `≤ 1024px` | Icon-only (72px) by default, not user-expandable at this tier (reclaims width for the grid; still toggleable to a full overlay via the hamburger, same as mobile) | Full pill input, `max-width: 400px` (narrower, still inline) | 2–3 |
| Mobile | `≤ 768px` | Hidden by default; hamburger opens it as a full-height overlay drawer (see above), closing on backdrop click, `Escape`, or category selection | Collapses to a search icon button; tapping it expands an absolutely-positioned full-width input overlay across the header, replacing the logo/add-button row until dismissed | 1 |

The grid's column *count* is never hard-coded at any tier — `repeat(auto-fill, minmax(280px, 1fr))` on `.card-grid` naturally produces the right count once the sidebar's reserved width and the grid's own padding are subtracted from the viewport at each tier, which is why the table's column counts are descriptive (what falls out of the math) rather than values set directly in CSS. What *is* tier-specific and does need explicit media queries: the sidebar's default mode (expanded/icon-only/hidden-overlay), the header search input's width and icon-vs-inline behavior, and `.card-grid`'s `padding` (24px desktop, 16px tablet, 12px mobile — tightened at smaller sizes so the 280px card minimum isn't squeezed into fewer columns than the viewport could otherwise fit).

### Main content / card grid

`margin-left: var(--yt-sidebar-width)` (or collapsed width) on desktop, `display: grid` for the card area with:

```css
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px 12px;
  padding: 24px;
}
```

`auto-fill` with a `minmax` floor naturally yields 4+ columns on wide desktop screens, 2-3 on tablet, 1 on mobile — satisfying the "multi-column down to single-column" responsive requirement without hard-coded breakpoints for the column count itself. See the "Breakpoint scale" table under the Sidebar section above for the exact tier thresholds (1024px, 768px) and what changes at each — grid padding, sidebar mode, and header search-bar behavior are the three things actually gated by media queries; column count is not.

### Card anatomy (per video)

```
.video-card
  .thumbnail-wrap (16:9 aspect-ratio box, border-radius var(--yt-radius-card), overflow hidden)
    img.thumbnail (object-fit: cover)
    .remove-btn (small circular button, top-right, opacity 0 by default, hover/focus reveals)
  .card-meta (flex row, padding-top 12px)
    .card-info
      .card-title (2-line clamp via -webkit-line-clamp, 500 weight, white)
      .card-channel (var(--yt-text-secondary), 14px)
      .card-sub (category pill, var(--yt-text-secondary), 12px)
```

Thumbnail aspect ratio is fixed at 16:9 (`aspect-ratio: 16/9`) to match YouTube's own thumbnail grid regardless of the actual source image's dimensions. Category renders as a small rounded pill with a subtle tinted background, colored by a concrete, deterministic function rather than a hand-assigned palette:

```js
function categoryColor(category) {
  const index = CATEGORIES.indexOf(category); // CATEGORIES is the fixed 12-item array (see Add-link flow)
  const hue = (index * 137.5) % 360; // golden-angle spacing: evenly, visually distinct hues
  return `hsl(${hue}, 45%, 45%)`; // fixed saturation/lightness tuned to read clearly on the dark surface tokens
}
```

Indexing into the already-fixed, already-ordered `CATEGORIES` array (rather than hashing the category string) is deliberately simpler than a general string-hash: it's still fully deterministic, guarantees exactly 12 visually distinct hues (golden-angle spacing avoids near-duplicate hues for adjacent indices), and needs no collision handling since the input domain is the 12-item array, not arbitrary text. `index` is always `0`–`11` for a valid document (rules enforce `category in [...]`), so `categoryColor` never has to handle `indexOf` returning `-1` in practice; if it ever did (e.g. a category value from before a future list change), the `hue` math still produces a stable, valid value from `-1 * 137.5 % 360`, so the function degrades gracefully rather than throwing. This is one of the pure, unit-testable helpers listed under Testability.

Hover micro-interactions (desktop, `@media (hover: hover)`): on `.video-card:hover` — thumbnail scales to `1.03` via `transform` (transition 150ms ease, `will-change: transform` only while hovered to avoid perf cost at rest), title color brightens slightly, `.remove-btn` opacity goes to 1, card gets a faint `box-shadow` lift. Clicking anywhere on the card except the remove button opens the playback modal; clicking the remove button stops propagation and triggers the remove-confirmation flow instead.

### Modals (add-link and playback)

Both use the same base `.modal-overlay` (fixed, full-viewport, `background: rgba(0,0,0,0.8)`, flex-centered) + `.modal-panel` (`background: var(--yt-surface)`, `border-radius: 12px`, max-width capped, own internal padding) pattern, toggled via a `hidden` attribute / `.is-open` class rather than being created/destroyed, so there's no layout thrash on open. `Escape` key and backdrop click close either modal; focus is moved to the modal's first input on open and returned to the triggering element on close (baseline keyboard/focus handling, not full ARIA dialog semantics, since this is a static personal/shared tool rather than a public product — see Accessibility note below).

- **Add-link modal**: URL input (autofocus) → on blur/paste-parse success, reveals: thumbnail preview, title input (pre-filled, editable), channel input (pre-filled, editable), category `<select>` (the fixed 12-item preset, required, pre-selected by `guessCategory` from the title/channel but always changeable before Save), Cancel/Save buttons. Save is disabled until a valid video ID has been parsed.
- **Playback modal**: a `16:9` wrapper containing a lazily-created `<iframe>` (`src` set only when the modal opens, cleared on close so background playback can't continue silently) pointed at `https://www.youtube.com/embed/<videoId>`, with `allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"` and `allowfullscreen`. Below the iframe: title, channel, category, and a "Remove from vault" action, mirroring YouTube's watch-page info block under the player.

### Empty state and loading skeleton

- **Loading**: before the first `onSnapshot` callback fires, render 8 skeleton cards (`.skeleton` class: thumbnail-wrap filled with a `var(--yt-surface)` block carrying a CSS `shimmer` animation — an animated `background-position` gradient sweep — plus two gray bars standing in for title/channel). This avoids an empty flash while Firestore's first snapshot is in flight.
- **Empty (no links at all)**: centered illustration/icon (inline SVG, simple "empty tray" glyph) + "Your vault is empty" + "Paste a YouTube link to get started" + a button that opens the add-link modal.
- **Empty (filtered to zero results)**: distinct message — "No videos match your search/filter" + a "Clear filters" button — so the user isn't told the whole vault is empty when it's just the current filter that's narrow.

### Accessibility baseline

Semantic landmarks (`<header>`, `<nav>` for sidebar, `<main>` for grid), buttons are real `<button>` elements (not `<div onclick>`), images carry `alt` text built from the video title, modals trap `Escape`-to-close and restore focus, color contrast for primary text (#fff on #0f0f0f) and secondary text (#aaaaaa on #0f0f0f/#212121) both clear WCAG AA for normal text size. This is a baseline, not a certified audit — full accessibility compliance would need manual testing with assistive technology, which is out of scope here.

## Firestore data model

Collection: `links`. One document per saved video, auto-generated document ID (not the video ID, so a resubmission attempt is a visible duplicate the UI can warn about rather than silently colliding — see duplicate handling below).

| Field | Type | Notes |
|---|---|---|
| `videoId` | string | 11-char YouTube ID, parsed from the URL. Indexed implicitly for the duplicate check (simple equality query). |
| `url` | string | The original URL the user pasted, stored as-entered (not reconstructed), so the card can link back to the exact form the user gave it. |
| `title` | string | From oEmbed, or user-edited/typed if oEmbed failed. |
| `channel` | string | From oEmbed's `author_name`, or empty string if unavailable. |
| `thumbnailUrl` | string | `https://img.youtube.com/vi/<videoId>/hqdefault.jpg` — always derived, never trusted from oEmbed's own thumbnail URL, so it's consistent and doesn't depend on oEmbed succeeding. |
| `category` | string | One of the fixed 12 preset values. Required, enforced both in the UI (`<select>`, can't submit empty) and in security rules. Pre-selected by `guessCategory` (see Add-link flow, step 3) but always user-changeable before Save. |
| `addedAt` | timestamp | `serverTimestamp()` — set by Firestore at write time, not the client clock, so ordering is consistent even if a device's clock is wrong. |

No `updatedAt`/edit flow exists — the spec's flows are add and remove only, so documents are immutable once created (editing is out of scope; removing and re-adding covers correction).

## Real-time sync approach

A single listener is attached once on page load:

```js
const q = query(linksRef, orderBy("addedAt", "desc"));
onSnapshot(q, (snapshot) => {
  const links = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  renderGrid(links); // full re-render from the authoritative snapshot
}, (error) => {
  showSyncError(); // see error handling below
});
```

This is the only source of truth the UI renders from — `app.js` never keeps a separate local array that it mutates optimistically on add/remove. The add and remove flows only ever write to Firestore; the grid updates purely in reaction to the next `onSnapshot` callback. This keeps the sync story simple and genuinely consistent across devices/tabs: whichever device changes the collection, every subscribed client (including the one that made the change) re-renders from the same server-confirmed state, so there is no divergent "local optimistic" view that could drift from reality. The tradeoff is a small latency (typically well under a second on a live connection) between clicking "Save"/"Remove" and seeing the UI update, which is an acceptable cost for guaranteed consistency in a tool with this usage pattern (a handful of users, infrequent writes). `orderBy("addedAt", "desc")` means newly added links always appear first, matching the natural "most recent at top" expectation.

Firestore's SDK keeps a local cache and queues writes while offline, replaying them on reconnect by default — this is not configured explicitly beyond the default `getFirestore()` behavior, since persistent IndexedDB cache isn't required for this use case (every device is expected to be online when using the vault) and skipping `enableIndexedDbPersistence` keeps `app.js` smaller. If the network drops mid-session, the `onSnapshot` error callback surfaces a small non-blocking "Reconnecting…" toast rather than clearing the grid.

## Add-link flow

### 1. URL parsing (client-side, pure function, unit-testable in isolation)

```js
const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

function extractVideoId(rawUrl) {
  let u;
  try { u = new URL(rawUrl.trim()); } catch { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");

  if (host === "youtu.be") {
    // youtu.be/<id>[?si=...][/extra], extra path/query segments ignored
    const id = u.pathname.slice(1).split("/")[0];
    return VIDEO_ID_RE.test(id) ? id : null;
  }
  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    if (u.pathname === "/watch") {
      // youtube.com/watch?v=<id>[&t=...][&list=...] — only `v` matters;
      // a `list` param alongside `v` is a video-in-playlist link, still playable,
      // so it is NOT rejected as a bare playlist URL.
      const id = u.searchParams.get("v");
      return id && VIDEO_ID_RE.test(id) ? id : null;
    }
    if (u.pathname.startsWith("/shorts/")) {
      const id = u.pathname.split("/")[2] ?? null;
      return id && VIDEO_ID_RE.test(id) ? id : null;
    }
    if (u.pathname.startsWith("/live/")) {
      // youtube.com/live/<id> — premiere/livestream permalink, same embed path works
      const id = u.pathname.split("/")[2] ?? null;
      return id && VIDEO_ID_RE.test(id) ? id : null;
    }
    if (u.pathname === "/" || u.pathname === "") {
      // youtube.com/?v=<id> (rare, but a valid alias for /watch?v=)
      const id = u.searchParams.get("v");
      return id && VIDEO_ID_RE.test(id) ? id : null;
    }
  }
  return null;
}
```

Covers the three required forms (`youtube.com/watch?v=`, `youtu.be/`, `youtube.com/shorts/`) plus three cheap extras: `youtube.com/live/<id>` (premieres/livestreams), `m.youtube.com`/`music.youtube.com` as alternate hosts, and a bare `youtube.com/?v=<id>`. Trailing path segments or extra query params (`youtu.be/<id>?si=...`, `/watch?v=<id>&t=42s`) are tolerated since only the first path segment or the `v` param is read — nothing else on the URL is inspected. A bare playlist URL (`/playlist?list=...`, no `v` param) or a channel URL correctly returns `null` since neither matches `/watch` with a `v` param nor any of the other branches.

The `u.protocol` check (`http:`/`https:` only) runs immediately after the `URL` parse succeeds, before any hostname/path branch — this rejects inputs like `ftp://youtube.com/watch?v=<id>` or `javascript:...` up front rather than letting them fall through to a hostname match that would otherwise succeed. It matters because `rawUrl` is stored verbatim in the `url` field and rendered back as a link-back on the card (see Firestore data model), so constraining it to the two schemes an anchor tag can safely navigate to is a correctness guard on that stored value, not just on parsing — even though the parsed `videoId` itself is only ever used to build a trusted `img.youtube.com`/`youtube.com/embed/` URL or an oEmbed request, never to execute or navigate using the scheme directly.

`VIDEO_ID_RE` (`[a-zA-Z0-9_-]{11}`, explicit character class rather than `\w` so it's unambiguous that digits/upper/lower/`_`/`-` are the only accepted characters and non-ASCII `\w` matches in some engines aren't a concern) is a **shape check, not a cryptographic validation** — YouTube IDs are a base64url-like 11-character token, and this regex accepts some 11-character strings that YouTube would never actually issue. That's an accepted, intentional gap: the only consequence of a false-positive match is that the app attempts to load a thumbnail/embed for a nonexistent ID, which surfaces to the user as the existing "thumbnail 404 → placeholder" and "embed fails to load" handling already specified below — not a new failure mode requiring new code.

Anything that doesn't match any branch above (playlists without `v`, channel URLs, community posts, malformed input, non-YouTube domains) returns `null`, and the modal shows an inline validation message ("Couldn't recognize this as a YouTube video link") instead of allowing submission — Save stays disabled.

### 2. Metadata auto-fetch, with a real fallback path

```js
const OEMBED_TIMEOUT_MS = 4000;

async function fetchMetadata(videoId, originalUrl) {
  const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OEMBED_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(originalUrl)}&format=json`,
      { signal: controller.signal }
    );
    if (!res.ok) throw new Error("oembed-failed");
    const data = await res.json();
    // Defensive even on a 200: don't trust the shape, only ever accept strings.
    return {
      title: typeof data.title === "string" ? data.title : "",
      channel: typeof data.author_name === "string" ? data.author_name : "",
      thumbnailUrl,
    };
  } catch {
    // Covers: CORS rejection, network failure, non-200, malformed JSON,
    // and the abort() fired by the timeout above — every path converges
    // on the same manual-entry fallback, so the UI has exactly one
    // "oEmbed didn't give us anything" branch to handle.
    return { title: "", channel: "", thumbnailUrl };
  } finally {
    clearTimeout(timeoutId);
  }
}
```

The `AbortController` timeout exists because `fetch` has no built-in deadline: without it, a request that neither resolves nor rejects (a stalled connection, rather than an outright network error) would leave the add-link modal's "auto-filling…" indicator spinning indefinitely instead of falling back to manual entry within a bounded, user-perceptible time. 4 seconds is chosen as long enough for a normal round trip but short enough that the manual-entry fields appear before the user has reason to think the app is stuck. The `finally` block always clears the timer so a fast successful response doesn't leave a dangling `setTimeout` firing later for no reason.

This needs an explicit, confirmed design call: the oEmbed endpoint (`https://www.youtube.com/oembed`) does **not** send an `Access-Control-Allow-Origin` header (verified directly — a live request returns `200` with the JSON body but no CORS header), so a `fetch()` from a page served on a Netlify origin will have the response blocked by the browser's CORS policy even though the HTTP call itself succeeds server-side. Given the hard constraint of no build step (so no Netlify Function / serverless proxy is available to work around this), the design treats oEmbed as a **best-effort enhancement that will typically fail in production**, not a reliable data source:

- The `fetch` call is still made (it may work in some environments, e.g. if YouTube changes policy, or via browser extensions that relax CORS, or in future), wrapped in try/catch.
- On any failure — network error, CORS rejection, non-200, malformed JSON — the catch block returns empty `title`/`channel` strings rather than throwing, and the add-link modal falls back to **manual entry**: the title and channel inputs are simply editable text fields that start empty and require the user to type a title (required field, Save disabled until non-empty) with channel optional.
- The thumbnail is **never** dependent on oEmbed. `https://img.youtube.com/vi/<videoId>/hqdefault.jpg` is loaded directly into an `<img>` tag, which does not require CORS (image loads aren't subject to the same-origin JSON-fetch restriction — only reading pixel data via canvas would be). This is why the thumbnail is specified as always-present and derived purely from the ID, while title/channel are specified as oEmbed-or-manual: the thumbnail is reliable, the metadata is not.
- If the `hqdefault.jpg` request itself 404s (extremely rare for a valid public video ID, but possible for deleted/private videos), the `<img>`'s `onerror` handler swaps in a static local placeholder (simple SVG "no thumbnail" graphic drawn inline in `app.js`/CSS, not a second network call) so a broken-image icon never appears in the grid.

This fallback behavior is called out explicitly in the UI copy (a small helper line under the title field: "Auto-filled when available — edit as needed") so the user isn't confused when fields come in empty.

### 3. Category: auto-guessed, with override

Category is a required `<select>` populated from the fixed array:

```js
const CATEGORIES = ["Music","Gaming","Education","Tech","Comedy","Sports","News","Cooking","Travel","Fitness","Movies/TV","Other"];
```

This same array drives the sidebar nav, the add-link modal's `<select>`, and the security rules' allow-list (kept as one constant at the top of `app.js`, referenced everywhere, and mirrored literally in `firestore.rules` since rules can't import JS — see Security Rules section for how that duplication is minimized).

There is no manual-only category entry anymore: a pure, unit-testable function, `guessCategory(title, channel)` (in `app-logic.js`, same style/doc-comment convention as `extractVideoId`), runs once oEmbed/manual title+channel are known — right after `handleUrlInput` sets `titleInput.value`/`channelInput.value` and before the preview section is revealed. It lower-cases and concatenates `title + " " + channel` into one haystack string, then tests it against `KEYWORDS_BY_CATEGORY` — a maintained keyword/substring list per category, one entry for each of the 12 `CATEGORIES` values except `Other` — in `CATEGORIES` order, so the first category whose keyword list has any matching substring wins. No scoring/ranking is needed: the keyword lists are chosen to minimize cross-category overlap, so first-match-wins is deterministic in practice. If nothing matches, it returns `"Other"` (the implicit fallback, no keyword list of its own).

The keyword lists (lower-case, substring match):

| Category | Keywords |
|---|---|
| Music | music, song, lyrics, album, official audio, ft., remix, cover, acoustic |
| Gaming | gameplay, gaming, playthrough, esports, walkthrough, speedrun, let's play, minecraft, fortnite |
| Education | course, lecture, how to, learn, explained, lesson, study guide |
| Tech | review, unboxing, benchmark, coding, programming, software, gadget, smartphone, "ai " |
| Comedy | comedy, funny, prank, sketch, stand-up, parody, meme |
| Sports | highlights, football match, basketball, nba, fifa, olympics, tournament |
| News | news, breaking, report, headlines, politics, election |
| Cooking | recipe, cooking, kitchen, baking, chef, food review, meal prep |
| Travel | travel, vlog, trip, destination, backpacking, tour guide |
| Fitness | workout, fitness, gym, yoga, exercise, training, cardio |
| Movies/TV | trailer, movie, film, episode, season, series, official clip |

Note: `"tutorial"` was deliberately left out of Education's list (even though it's an intuitive fit) because `Education` is earlier than `Cooking` in `CATEGORIES` order and first-match-wins — a title like "Full Pasta Recipe Tutorial" would otherwise be caught by Education's `"tutorial"` before Cooking's `"recipe"` is ever checked. Similarly, Sports' bare `"match"` was narrowed to `"football match"` since the bare word collides with ordinary phrases like "no keyword match" that should fall through to `Other`. Both adjustments were caught by the `guessCategory` unit tests (see Testability/`app-logic-tests.mjs`) and are a reminder that the keyword lists are a maintained, tunable asset — not a one-time static list — if false-positive collisions turn up in practice.

The guessed category is wired into the UI as a **pre-selection, not a silent or locked-in auto-pick** — this is a deliberate UX decision, not an oversight. `app.js`'s `handleUrlInput` sets `el.categorySelect.value = guessCategory(meta.title, meta.channel)` right after the title/channel inputs are filled. The `<select>` remains the same fully visible, fully interactive control it always was: the user sees the guess, can change it to any of the other 11 presets before clicking Save, and nothing in the submit handler changes — `category` is still read from `el.categorySelect.value` at submit time, exactly as before. The category enum validation in `firestore.rules` (`d.category in [...]`) does not change either; auto-guessing only affects what the `<select>` starts on, never what values are accepted.

### 4. Duplicate handling

Before writing, the add flow runs `getDocs(query(linksRef, where("videoId", "==", id)))` (one-shot, not a listener) rather than relying on the realtime cache, so it reflects the actual current server state even if this device joined the sync group moments ago. If a match exists, the modal shows "This video is already in your vault" with a non-blocking "Add anyway" override (duplicates aren't forbidden by the data model or security rules — only discouraged by the UI — since two users independently saving the same video is a legitimate case, not an error).

### 5. Write

```js
await addDoc(linksRef, { videoId, url, title, channel, thumbnailUrl, category, addedAt: serverTimestamp() });
```

On success the modal closes immediately; the grid updates via the `onSnapshot` listener, not a local push (see Real-time sync approach). On failure (permission-denied from rules, offline with no queued-write support assumed, or any other Firestore error), the modal stays open, inputs retain their values, and an inline error banner reads "Couldn't save this link — check your connection and try again," so no typed input is lost.

## Remove flow

Triggered from the card's `.remove-btn` or the playback modal's "Remove from vault" action. Both paths go through one confirmation step — a small inline confirm (replace the remove icon with a checkmark/× pair for 3 seconds, or a lightweight native `confirm()`-style custom modal for the playback-modal path) to guard against accidental clicks, since this is a destructive, irreversible action in a shared vault with no undo and no trash.

```js
async function removeLink(docId) {
  await deleteDoc(doc(db, "links", docId));
}
```

That's the entire operation — there is no soft-delete/trash collection (not required, and would add complexity disproportionate to the ask). On success, the card disappears from every subscribed device via the same `onSnapshot` propagation described above (this is literally the mechanism, not a separate "notify other devices" step — deleting the doc is sufficient). On failure (rules rejection or network error), an inline toast reads "Couldn't remove this link — try again," and the card remains in place since the grid still reflects the last-known server snapshot.

## Filtering and search

Both are pure client-side operations over the in-memory array already received from `onSnapshot` — no additional Firestore queries, since the full `links` collection for a personal/shared vault is small enough to hold entirely in memory, and this keeps filter/search instant (no network round-trip per keystroke).

- **Category filter**: sidebar selection sets `state.activeCategory` (`"All"` or one of the 12 presets). `"All"` is the default/Home state.
- **Text search**: the header search input debounced at ~200ms, lower-cased, matched via `.includes()` against `title` and `channel` only for every link currently passing the category filter.
- Filtering logic is a single pure function `filterLinks(links, { category, searchTerm })` called every time the source array (`onSnapshot`), the category, or the search term changes, re-rendering the grid from its result. Being pure and side-effect-free, it's directly unit-testable without mocking Firestore.
- The empty-state distinction described earlier (full vault empty vs. filtered-to-zero) is driven by comparing `links.length` (raw) against `filterLinks(...).length` (post-filter).

## Video playback modal

Opening a card sets `state.playingVideoId` and renders the iframe `src` to `https://www.youtube.com/embed/<videoId>` only at that point (not pre-rendered for every card, which would mean 50+ live iframes on a large vault — a real performance concern avoided by construction). Closing the modal (Escape, backdrop click, explicit close button, or triggering remove) clears `state.playingVideoId`, which tears down the iframe (removes it from the DOM / clears `src`) rather than just hiding it, so playback actually stops rather than continuing silently behind the overlay.

## Firestore security rules design

Since there is no authentication (explicit hard constraint — open shared vault), "security" here means: scope all access to exactly the `links` collection, reject writes that don't match the expected document shape, and deny everything else in the project by default. This doesn't prevent a malicious actor who has the public config from writing garbage (that's an inherent tradeoff of "no login, open vault," accepted by the requirements), but it does prevent the collection from being used to store arbitrary unbounded data, and it keeps every other collection in the Firestore database (current or future) inaccessible unless rules are deliberately extended.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ---- Open shared vault: the `links` collection only. ----
    // No auth by design. These rules cannot stop a determined actor who
    // has the public config from writing well-formed junk, but they DO
    // bound the shape/size of every document and deny everything else,
    // so the collection can't be used as free unbounded storage.
    match /links/{linkId} {

      allow read: if true;

      allow create: if isValidLink(request.resource.data);

      allow delete: if true;
      allow update: if false;   // create-or-delete model; no edit flow exists
    }

    // Shape + size validation for a new link document.
    function isValidLink(d) {
      return d.keys().hasOnly(
               ['videoId','url','title','channel','thumbnailUrl','category','addedAt'])
          && d.keys().hasAll(
               ['videoId','url','title','channel','thumbnailUrl','category','addedAt'])
          && d.videoId is string      && d.videoId.size() == 11
          && d.url is string          && d.url.size() > 0   && d.url.size() <= 500
          && d.title is string        && d.title.size() > 0 && d.title.size() <= 500
          && d.channel is string      && d.channel.size() <= 200
          && d.thumbnailUrl is string && d.thumbnailUrl.size() <= 500
          && d.category in ['Music','Gaming','Education','Tech','Comedy','Sports',
                            'News','Cooking','Travel','Fitness','Movies/TV','Other']
          && d.addedAt == request.time;
    }

    // Everything outside `links` is denied, read and write.
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

Design decisions worth calling out explicitly:

- **`allow update: if false`**: the data model is create-or-delete only (no edit flow, stated above), so update is denied outright rather than validated — this closes off a whole class of tampering (altering an existing doc's category/videoId after creation) that the app itself never needs.
- **`hasOnly([...])` + `hasAll([...])`**: `hasOnly` rejects any write carrying extra fields (so the collection can't be used to smuggle arbitrary additional data through the open write rule), and `hasAll` rejects a write that omits any required field. Together they pin the document to exactly the seven expected keys.
- **`&&` chains evaluate left to right with short-circuiting**: this is why `d.videoId is string && d.videoId.size() == 11` is safe to write directly — if `videoId` is absent or not a string, the `is string` check fails and `.size()` is never evaluated against a missing/wrong-typed value (which would otherwise throw and deny the write anyway, but relying on the type guard first keeps the intent explicit rather than incidental). Every field check in `isValidLink` follows this same `is <type>`-then-constrain pattern for that reason.
- **Abuse guardrails (string caps), no auth/App Check/reCAPTCHA**: the string-length ceilings (`url`/`title`/`thumbnailUrl` ≤ 500, `channel` ≤ 200) are the lightweight anti-abuse layer. They bound how much data any single well-formed write can store, which — combined with the Spark-tier quotas and the budget alert recommended in the README — is the deliberate, proportionate defense for an open, login-less vault. Heavier mechanisms (Firebase Authentication, App Check, reCAPTCHA) are explicitly **not** used: they were considered and rejected as disproportionate to a small personal/shared tool and in direct tension with the "no login" hard constraint.
- **`addedAt == request.time`**: forces the timestamp to be the server's write-time value, not a client-supplied timestamp — this is what makes `orderBy("addedAt")` trustworthy across devices with different local clocks, and it means `app.js` must pass `serverTimestamp()` (a sentinel, resolved server-side) rather than `new Date()`, matching the write code shown above.
- **`category in [...]`**: the 12-preset allow-list is duplicated here from the `CATEGORIES` constant in `app.js` because Firestore rules are a separate, non-JS runtime and can't import a shared constant. This duplication is a known, accepted cost of the "no backend" architecture; the two lists are kept adjacent in their respective files with a comment in each pointing at the other, so a future category addition is a two-file, not two-system, change.
- **`videoId.size() == 11`**: cheap shape validation that rejects obviously-malformed IDs without needing a regex (Firestore rules support `matches()` too, but a fixed-length check is sufficient here since `extractVideoId` on the client already guarantees the `VIDEO_ID_RE` ([a-zA-Z0-9_-]{11}) shape before a write is attempted — the rule is a backstop against a client that skips `app.js` entirely and calls the SDK directly, not the primary validation layer). Note the rule only checks length, not character set, so it is intentionally looser than the client-side regex — tightening it to `d.videoId.matches('[a-zA-Z0-9_-]{11}')` would be a reasonable future hardening step, but is not required for the stated threat model (bounding shape/size, not policing exact character legality server-side).
- **Trailing deny-all (`{document=**}`)**: anything outside `links` — any other current or future collection — is denied for both read and write, so a mistake elsewhere in the project (or a future collection added without matching rules) fails closed instead of open.

`allow read: if true` and `allow delete: if true` are the explicit, intentional expression of "open shared vault, no login" from the requirements — not an oversight. If authentication is ever added later (explicitly out of scope now), these two lines are the ones that change.

## Netlify deployment (netlify.toml)

```toml
[build]
  publish = "."

[[headers]]
  for = "/*"
  [headers.values]
    X-Content-Type-Options = "nosniff"
    X-Frame-Options = "SAMEORIGIN"
    Referrer-Policy = "strict-origin-when-cross-origin"
```

No `command` key is set under `[build]` since there's nothing to build — Netlify serves the repo root's static files as-is. The security headers are a lightweight, free hardening step (no functional dependency on them) appropriate for a publicly reachable static site. No redirects/rewrites are needed since this is a true single page with no client-side router (everything — category filter, search, modals — is state within the one `index.html`, not separate routes).

## README.md update

The existing README ("Stores all the Youtube Links...") is preserved as the opening line and extended with: what the app does, a link/description of the live Netlify URL (placeholder until deployed), the tech stack bullet list (static HTML/CSS/JS, Firebase Firestore, no API keys, no build step), local development instructions (open `index.html` directly, or serve via any static file server — no install step), how the Firestore `links` collection is structured (short version of the table above), and a note on deploying your own copy (create a Firebase project, enable Firestore, paste your own `firebaseConfig`, publish `firestore.rules` via `firebase deploy --only firestore:rules` or the console rules editor, then deploy the repo root to Netlify).

The README also carries a short **"Cost & abuse" note** making the open-vault tradeoff explicit for anyone forking this:

- This vault has **no login** by design, so anyone with the (public, client-side) Firebase config can read, add, and delete links. The `firestore.rules` guardrails bound the *shape and size* of writes but do not and cannot gate *who* writes.
- Recommend staying on the **Firebase Spark (free) tier**, whose fixed daily Firestore quotas (reads/writes/deletes and stored-data ceilings) act as a natural hard cap: once the free quota is exhausted for the day, further operations are simply rejected rather than billed, which bounds the blast radius of accidental or abusive traffic to "the vault stops working until tomorrow" rather than "a surprise bill."
- For anyone who upgrades to the pay-as-you-go **Blaze** plan (needed only if the free quotas are outgrown), the README instructs setting a **Google Cloud billing budget + alert** on the project (e.g. a low monthly threshold with email alerts at 50/90/100%) so unexpected usage is caught early. This is a dashboard/console step, not code, but it is the recommended safety net given the login-less write path.

These are operational recommendations, not enforced by any file in the repo; they are documented so the open-vault decision is a conscious, bounded one rather than an open-ended liability.

## Edge cases summary

| Case | Handling |
|---|---|
| Pasted URL isn't a recognizable YouTube link | `extractVideoId` returns `null`; Save stays disabled; inline error shown. |
| oEmbed blocked by CORS / fails / times out | Caught; title/channel fall back to empty+manual; thumbnail unaffected (derived from ID, not oEmbed). |
| `hqdefault.jpg` 404s (deleted/private video) | `<img onerror>` swaps in a static placeholder graphic; no extra network call. |
| Duplicate video re-added | One-shot `where("videoId","==",id)` check warns before write; user can override. |
| Two devices add/remove at the same moment | Each write is independent and atomic at the Firestore level; `onSnapshot` on all clients converges to the same final state; no client-side merge logic needed. |
| Network drops mid-session | `onSnapshot` error callback shows a non-blocking "Reconnecting…" toast; grid keeps last-known state rather than clearing. |
| Rules reject a malformed write (e.g. bad category, extra field, client bug) | `addDoc`/`deleteDoc` promise rejects; caught in the add/remove flow; inline error shown; no silent failure. |
| User removes a video that's currently open in the playback modal | Remove action also clears `state.playingVideoId` and closes the modal, since the doc it refers to no longer exists. |
| Very long title/channel text | Rules cap `title`/`url`/`thumbnailUrl` length (≤ 500) and `channel` (≤ 200); CSS `line-clamp`/`text-overflow` handle visual truncation regardless. |
| JS disabled / Firestore SDK fails to load (e.g. CDN blocked) | Out of scope for graceful degradation — this app has a hard dependency on JS and the Firebase CDN by design; a `<noscript>` tag states "This app requires JavaScript" as a minimal courtesy, not a functional fallback. |

## Testability

- **Unit-testable in isolation (pure functions, no Firestore/DOM needed)**: `extractVideoId`, `filterLinks`, `guessCategory`, `categoryColor`. These are the highest-value targets for actual unit tests (e.g. with a small test runner like `uvu` or even hand-rolled `console.assert` checks run via `node app-logic-tests.mjs`, kept dependency-free to respect the no-npm constraint — or simply exercised manually against the edge-case table above if no test runner is introduced).
- **Integration/manual-tested**: the full add flow against a real (or Firestore emulator) backend, rules behavior (ideally via the Firestore emulator + `@firebase/rules-unit-testing` if a test setup is later introduced, though that itself would need npm — reasonable to defer and instead verify rules manually via the Firebase console's Rules Playground), multi-tab sync (open two browser tabs, add in one, confirm the other updates), and all responsive breakpoints (manual resize / device emulation in devtools).
- The deliberate choice **not** to maintain a separate local-optimistic state (described in "Real-time sync approach") also simplifies testing: the grid is a deterministic function of `(links from onSnapshot, activeCategory, searchTerm)`, so any observed grid state can be explained by inspecting just those three inputs, with no hidden local mutation history to account for.

## Responses to design review findings

- **Finding 1 (MEDIUM, tags element type never validated)** — Addressed at the time by adding `isValidTags(d.tags)` to `firestore.rules`. **Superseded**: the `tags` field (and `isValidTags`) was removed from the data model entirely in a later change (tags are no longer a feature of this app — see Firestore data model and Add-link flow above), so this finding and its fix no longer apply. Left here for history rather than deleted, since the "Responses to design review findings" section is a record of a past review cycle, not a description of current behavior.
- **Finding 2 (MEDIUM, undefined hash-to-hue)** — Addressed, using the review's own suggested approach. Added a concrete `categoryColor(category)` function (index into the fixed `CATEGORIES` array via `indexOf`, golden-angle hue spacing `(index * 137.5) % 360`, fixed `hsl(_, 45%, 45%)` saturation/lightness) in the Card anatomy section, and renamed references to it consistently (including in Testability) so "hash-to-hue"/"hash-to-color" no longer appears as an unspecified placeholder anywhere in the document.
- **Finding 3 (NIT, dead `firstSegment` helper)** — Addressed. Deleted the unused line from `extractVideoId`; verified via search that no other section of the document references `firstSegment`.
- **Finding 4 (NIT, unchecked URL scheme)** — Addressed. Added a `u.protocol !== "http:" && u.protocol !== "https:"` guard immediately after the `URL` parse succeeds, with prose explaining the rationale is less about the parsed `videoId` (always used safely regardless of scheme) and more about the raw `url` field, which is stored verbatim and rendered back as a link on the card — constraining accepted schemes to the two an anchor tag can safely navigate protects that downstream use.
- **Unverified/Wrong Assumptions item (rules "for-all-elements" claim)** — **Superseded along with Finding 1**: this item concerned validating the elements of the (now-removed) `tags` list in security rules. Since the `tags` field, the `tags.size()` cap, and `isValidTags` were all removed when tags were dropped from the data model, there is no list field left in a `links` document to validate per-element, so this item no longer applies. Left here for history only.

No findings were backlogged or ignored — all four were cheap, concrete, and consistent with the original requirements (no API key, no build step, no auth, Firestore `links` collection, Firebase v10 CDN ES modules, no analytics), none of which this revision touched.
