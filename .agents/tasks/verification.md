# Verification — YouTube Link Vault

This records exactly what was run to verify the implementation so the reviewer
does not need to re-run anything.

## Environment

- macOS, Node v25.5.0, Google Chrome (headless, `--headless=new`) driven over CDP.
- Static server: `python3 -m http.server 8744` from the repo root.

## 1. Unit tests (pure helpers)

Command:

```
node app-logic-tests.mjs
```

Result: **26/26 passed.** Covers `extractVideoId` (watch / youtu.be / shorts /
live / rejecting playlists, channels, non-YouTube domains, `javascript:` and
`ftp:` schemes, malformed input), `categoryColor` (deterministic + distinct
hues across all 12 presets), `parseTags` (trim/lowercase/empty-drop, 15-tag cap,
50-char cap, empty/undefined), and `filterLinks` (category, "All", search by
title/channel/tag, combined, no-match).

## 2. Live browser verification (headless Chrome + CDP)

Served the site at `http://localhost:8744/index.html`, loaded it in headless
Chrome, captured `Runtime.consoleAPICalled` (error) and
`Runtime.exceptionThrown`, then exercised the UI. Results:

- **Console errors: none. Uncaught exceptions: none.** The Firebase v10 CDN ES
  module imports resolved and `initializeApp` / `getFirestore` ran without
  throwing (confirmed indirectly: the page wired up and rendered 13 sidebar
  nav items = "All" + 12 categories, which only happens if the module graph
  loaded end to end).
- **oEmbed URL formation** (recomputed in-page with the same encoding the app
  uses): `https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DjNQXAC9IVRw&format=json`
  — correctly `encodeURIComponent`-escaped, `&format=json`, no API key.
- **Add-link flow** (opened the modal, set `#url-input` to a real watch URL,
  dispatched `input`, waited out the 300ms debounce + oEmbed + duplicate check):
  - preview section became visible,
  - title auto-filled to `Me at the zoo`,
  - channel auto-filled to `jawed`,
  - thumbnail `src` = `https://img.youtube.com/vi/jNQXAC9IVRw/hqdefault.jpg`,
  - **Save button enabled (`disabled === false`)** — this is the previously
    reported bug, now fixed (see below).

### Responsive layout (CDP `Emulation.setDeviceMetricsOverride`)

| Width        | sidebar width | sidebar transform        | main margin-left | grid padding |
| ------------ | ------------- | ------------------------ | ---------------- | ------------ |
| Desktop 1440 | 240px         | none                     | 240px            | 24px         |
| Tablet 900   | 72px          | none                     | 72px             | 16px         |
| Mobile 375   | 240px (drawer)| translateX(-240) offscreen | 0px            | 12px         |

All three tiers match the intended breakpoints: expanded sidebar on desktop,
icon-rail on tablet, off-canvas drawer on mobile with full-width content.

## 3. The Save-button fix

**Symptom (reported by the prior attempt):** after a valid URL auto-filled the
title/thumbnail, the Save button stayed permanently disabled.

**Root cause:** in `handleUrlInput`, `updateSaveButtonState()` was only called
*after* the advisory duplicate-check `getDocs(...)` round trip. If that query was
slow or hung, the button never got enabled even though a video ID and title were
already present.

**Fix:** call `updateSaveButtonState()` immediately after the preview is
populated, *before* the duplicate check runs. The duplicate check is now purely
advisory and no longer gates the Save button. Verified enabled in the live run
above. (The two temporary `console.log("DEBUG ...")` lines the prior attempt
added were also removed.)

## 4. Limitation

Actual Firestore **writes/reads over the wire depend on the user publishing**
`firestore.rules` **in the Firebase Console** (Firestore Database → Rules), which
cannot be done from static code. The verification above confirms the client
initializes, forms requests correctly, and the full add-link UI path works up to
the point of the write; end-to-end persistence is gated on that one console step,
documented in README.md.

## 5. Cleanup

The temporary static server, headless Chrome instance, CDP scripts, and Chrome
profile directories created for verification were stopped and removed after the
run.
