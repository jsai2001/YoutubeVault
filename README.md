# TubeStash

A shared, real-time synced library of YouTube links with a YouTube-lookalike dark
UI. Paste a link, the app guesses a category for you, and it shows up instantly on
every device watching the same stash. No login, no build step, no YouTube API key.

- **Plain static site** — just `index.html`, `styles.css`, `app.js`. Drag the
  folder onto Netlify or open it through any static server. Zero config.
- **Real-time sync** via Firebase Firestore (`onSnapshot`). Adds and removes
  propagate to all open clients live.
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

Live reads and writes require the Firestore rules below to be published. Until
then the UI loads fine but Firestore writes are rejected.

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

1. You paste a URL. The app parses the video ID from `youtube.com/watch?v=`,
   `youtu.be/`, `youtube.com/shorts/`, and `youtube.com/live/` forms.
2. It fetches the title and channel from YouTube oEmbed (no key). The thumbnail
   comes from the video ID directly, so it works even if oEmbed is unavailable.
3. The app guesses a category from the title/channel and pre-selects it — change
   it before saving if it guessed wrong.
4. Saving writes one document to the `links` collection; removing deletes it.
   Both changes sync to every open client in real time.

## Firebase configuration

The `firebaseConfig` embedded in `app.js` is the project's **public** web config
(this is expected to be public for client-side Firebase apps — access is governed
by the Firestore rules, not by hiding the config). Analytics is intentionally not
wired up.
