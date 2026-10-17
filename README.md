# TubeStash

A shared, real-time synced library of YouTube links with a YouTube-lookalike dark
UI. Paste a link, the app guesses a category for you, and it shows up instantly on
every device watching the same stash. No login, no build step, no YouTube API key.

**Live:** <https://tubestash.netlify.app/>

> **First-run requirement:** the app renders only from the Firestore snapshot, so
> it will sit on the loading skeleton forever until the Firestore security rules
> are published (see [Firestore rules](#firestore-rules-required--console-step)).
> Publishing the rules is a one-time manual step in the Firebase Console.

- **Plain static site** — just `index.html`, `styles.css`, `app.js`. Drag the
  folder onto Netlify or open it through any static server. Zero config.
- **Real-time sync** via Firebase Firestore (`onSnapshot`). Adds and removes
  propagate to all open clients live.
- **Shuffled on each load.** The grid is given a fresh random order every time
  the page loads (stable across the session so adds/removes don't reshuffle).
  This is a display-only change in the browser — nothing in Firestore changes.
- **No YouTube Data API key.** Titles/channels are auto-filled through the public
  YouTube **oEmbed** endpoint (CORS-open, no key); thumbnails are derived directly
  from the video ID (`img.youtube.com/vi/<id>/hqdefault.jpg`).
- **Auto-guessed category, with override.** Category is a dropdown from a fixed
  preset, pre-selected by matching keywords in the title/channel — you can
  change it before saving if the guess is wrong.
- **No authentication** — this is an open, shared stash. Anyone with the page can
  read, add, and remove links.

## Project layout

| File                 | Purpose                                                            |
| -------------------- | ------------------------------------------------------------------ |
| `index.html`         | Page shell: header, sidebar, card grid, and modals.                |
| `styles.css`         | Full YouTube-lookalike design system and responsive layout.        |
| `app.js`             | Firebase init, Firestore CRUD, rendering, and modal logic.         |
| `app-logic.js`       | Pure helpers (URL parsing, filtering, oEmbed fetch) — no DOM/Firebase. |
| `app-logic-tests.mjs`| Node unit tests for the pure helpers. Not shipped to users.        |
| `firestore.rules`    | Firestore security rules to paste into the Firebase Console.       |
| `netlify.toml`       | Netlify static config (publish = repo root, no build command).     |
| `manifest.json`      | PWA manifest — makes the site installable as a standalone app.     |
| `icon.svg`           | Source app/brand mark (YouTube-style, our own geometry).           |
| `apple-touch-icon.png` / `icon-192.png` / `icon-512.png` / `favicon-32.png` | Rasterized icons for iOS home screen, PWA, and favicon fallback. |

## Install as a standalone app

The site is a PWA, so it can be installed to a home screen and launches
fullscreen with no browser chrome.

**iOS (Safari):** open <https://tubestash.netlify.app/> → tap the **Share**
button → **Add to Home Screen**. iOS has no one-tap install prompt (an Apple
limitation), so the Share-sheet step is required. The app then opens fullscreen
with the TubeStash icon.

**Android (Chrome) / desktop:** use the browser's **Install app** / **Add to
Home screen** option in the address bar or menu.

> The icons use a YouTube-style play mark drawn in our own geometry — not
> Google's trademarked logo — so the app is visually familiar without using the
> actual YouTube brand assets. To regenerate the PNGs from `icon.svg` on macOS:
> `qlmanage -t -s 1024 -o /tmp icon.svg` then `sips -z 180 180 /tmp/icon.svg.png --out apple-touch-icon.png` (repeat at 192/512/32).

## Run locally

It's a static site, so you can open it directly or serve it. Serving is
recommended because ES module imports behave best over `http://`.

```bash
# Option A: Python (built in on most systems)
python3 -m http.server 8000

# Option B: Node
npx serve .
```

Then open <http://localhost:8000> (or the port the server prints).

> Opening `index.html` straight from the filesystem (`file://`) also works in
> most browsers, but a local server avoids occasional module/CORS quirks.

Live reads **and** writes require the Firestore rules below to be published.
Until then Firestore rejects the initial read with `permission-denied`, the
first `onSnapshot` never arrives, and the page stays stuck on the loading
skeleton. Publishing the rules (see below) is what makes the site work.

## Deploy to Netlify

**Option A — drag and drop**

1. Go to <https://app.netlify.com/drop>.
2. Drag this project folder onto the page.
3. Netlify serves it as-is. `netlify.toml` sets the publish directory to the repo
   root with no build command.

**Option B — connect a Git repo**

1. Push this folder to a Git provider (GitHub/GitLab/Bitbucket).
2. In Netlify, **Add new site → Import an existing project** and pick the repo.
3. Leave the build command empty and set the publish directory to the repo root
   (`.`). `netlify.toml` already encodes this, so the defaults should just work.

## Firestore rules (required — console step)

The security rules in `firestore.rules` **cannot** be applied from this static
code; they must be pasted into the Firebase Console by the project owner:

1. Open the [Firebase Console](https://console.firebase.google.com/) and select
   the **vault-dd939** project.
2. Go to **Firestore Database → Rules**.
3. Replace the contents with everything in `firestore.rules`.
4. Click **Publish**.

These rules make the `links` collection publicly readable and writable (no auth),
but validate every document's shape — `url`/`title`/`channel` are non-empty
strings, `category` is one of the 12 presets, `thumbnailUrl` is a string, and
`addedAt` is a server timestamp. Every path outside `links` is denied.

## How a link is added

Adding is one step — paste a link and it's saved immediately, no confirmation.

1. Click **Add**, paste a URL. The app parses the video ID from
   `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/shorts/`, and
   `youtube.com/live/` forms. A valid link is added the moment you finish
   pasting (or press Enter); an unrecognized link shows an inline error instead.
   If the same video is already in the stash, the add is skipped with a "That
   video is already in your stash" notice rather than creating a duplicate.
2. The app fetches the title and channel from YouTube oEmbed (no key), guesses a
   category from them, and writes the document. The thumbnail comes from the
   video ID directly, so it always works even if oEmbed is unavailable. If
   oEmbed returns nothing (common in production due to CORS), the link is saved
   with a placeholder title you can fix by removing and re-adding.
3. A confirmation toast appears for a few seconds with two controls:
   - **Category dropdown** — change the guessed category on the spot (since
     documents are immutable, this re-adds the link under the new category).
   - **Undo** — removes the link you just added.
4. Removing a link deletes its document instantly — no confirmation. A "Removed
   … Undo" toast appears for a few seconds so a misclick is recoverable (Undo
   re-adds the link). Every add, category change, and remove syncs to every open
   client in real time.

### Two ways to add, two ways to remove

- **Add:** the **Add** button (paste a link in the modal), or paste a YouTube
  link straight into the **search box** and press Enter — both run the same
  pipeline (fetch, guess category, dedup, toast). When the search box holds a
  link, its icon turns into a **+** to signal that Enter adds rather than
  searches.
- **Remove:** the trash icon on each card (always visible, one tap), or the
  **Remove from stash** button in the playback view. Both remove instantly with
  an Undo toast.

### Search

Search matches across **title, channel, and category**, and is **multi-term**:
every word you type must appear somewhere in the link (in any order). So
`lofi guitar` finds a video whose title has both words, and `music chill` can
match via the category plus the title.

On mobile, the search bar opens from the magnifier icon and **auto-closes after
5 seconds of inactivity** — but only when the box is empty, so a filter you've
typed and are reading is never collapsed out from under you.

## Firebase configuration

The `firebaseConfig` embedded in `app.js` is the project's **public** web config
(this is expected to be public for client-side Firebase apps — access is governed
by the Firestore rules, not by hiding the config). Analytics is intentionally not
wired up.
