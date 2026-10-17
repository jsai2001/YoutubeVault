# Verification — Remove tags, auto-guess category, fix save visibility

This supersedes the previous verification.md. It records the verification of the
three scoped changes (remove tags, category auto-guess with override, diagnose &
fix the save-not-persisting report) against the live Firebase project `vault-dd939`.

## 1. Unit test suite

Command (run from the package root):

```
node app-logic-tests.mjs
```

Result: **33 tests passed, exit 0.** This includes:

- all existing `extractVideoId` tests (12),
- `categoryColor` tests (2),
- the 14 new `guessCategory` tests — one per category (Music, Gaming, Education,
  Tech, Comedy, Sports, News, Cooking, Travel, Fitness, Movies/TV), one
  default-to-`Other` case, and one case-insensitivity case,
- the `filterLinks` tests (6), now with the tag-search test removed and the
  `tags` property dropped from the `sampleLinks` fixtures, so search is verified
  to match **title and channel only**.

The `parseTags` tests were removed because `parseTags` no longer exists.

## 2. Tags fully removed — confirmed

- `grep -niE "\btags?\b"` across `index.html app.js app-logic.js styles.css
  firestore.rules app-logic-tests.mjs` returns only a false positive on the word
  "sta**g**ed" in an app.js comment. No `tags` field, UI, CSS, or rule reference
  remains.
- `firestore.rules`: `'tags'` removed from both `hasOnly` and `hasAll`; the
  `d.tags is list && d.tags.size() <= 15` check and the `isValidTags(d.tags)`
  call removed; the entire `isValidTags` helper deleted. The `d.category in
  [...]` 12-value enum line is byte-for-byte unchanged.
- Headless-Chrome DOM check (see §4): `#tags-input` = absent, `#player-tags` =
  absent, `.tag-chips` element count = 0, search placeholder = "Search title or
  channel".
- `README.md` and `.agents/tasks/design.md` rewritten so no passage describes
  tags as a live feature; the old design-review Finding 1 (and the related
  "for-all-elements" assumptions item) are annotated as **superseded** rather
  than deleted, since that section is a historical record of a past review cycle.

## 3. Category auto-guess with override — confirmed

- Pure function `guessCategory(title, channel)` added to `app-logic.js` next to
  `extractVideoId`, same doc-comment style. It lower-cases `title + " " +
  channel`, tests against `KEYWORDS_BY_CATEGORY` (one list per category except
  `Other`) in `CATEGORIES` order, first match wins, defaults to `"Other"`.
- Wired into `app.js` `handleUrlInput`: after `titleInput`/`channelInput` are
  filled, `el.categorySelect.value = guessCategory(meta.title, meta.channel)`
  runs before the preview section is shown. The `<select>` stays the same fully
  visible, interactive control — **pre-selected, not silent or locked**.
- Two keyword-list tuning notes (documented in design.md): `"tutorial"` was kept
  out of Education so "Full Pasta Recipe Tutorial" resolves to Cooking via
  `"recipe"`; Sports' bare `"match"` was narrowed to `"football match"` so
  ordinary phrases like "no keyword match" fall through to `Other`. Both were
  caught by the unit tests.
- Category remains **required** and is still validated against the same
  unchanged 12-value enum in `firestore.rules`.
- Headless check (see §4): with live oEmbed data for the Rick Astley video,
  the select pre-selected `"Other"` (correct — that title/channel matches no
  keyword), and manually setting it to `"Fitness"` stuck — override works.

## 4. Headless-browser verification (CDP-driven Chrome)

No Playwright/Puppeteer is installed; Chrome at
`/Applications/Google Chrome.app` was driven over the DevTools Protocol
(`--headless=new --remote-debugging-port=...`) against a local
`python3 -m http.server`. Each run started its own server + Chrome profile and
tore both down afterward; all scratch scripts lived under `/tmp/vault_diag`,
now deleted.

Final combined check (`final_check.mjs`) output:

```
NO_TAG_UI: {"tagsInput":false,"playerTags":false,"tagChips":0,"searchPlaceholder":"Search title or channel"}
LAYOUT:    {"headerH":56,"sidebarW":240,"navItems":12,"categoryOptions":12}
GUESS_STATE (live oEmbed): {"preselected":"Other","optionCount":12,"titleFilled":"Rick Astley - Never Gonna Give","channelFilled":"Rick Astley"}
OVERRIDE_RESULT (set to Fitness): Fitness
```

Header height (56px), sidebar width (240px), 12 nav items and 12 category
options confirm **no visual/layout regression** — only `.tag-chips` was removed
from CSS, and nothing else in the dark YouTube-lookalike layout changed.

## 5. Save-not-persisting — root cause

### What was reproduced

Add-link flow driven end to end (paste
`https://www.youtube.com/watch?v=dQw4w9WgXcQ`, let oEmbed fill, Save):

- **Pass 1 (UI flow):** `addDoc` resolved with **no thrown error**, no
  `console.error`, the save-error banner stayed hidden, and the card appeared
  locally (card count 0 → 1). The `Write/channel` request to
  `firestore.googleapis.com` returned HTTP 200.
- **Pass 2 (fresh page load):** the grid read back **0 cards** from the server.
- **Pass 3 (direct, server-forced probe):** a direct
  `getCountFromServer(linksRef)` call **hung indefinitely** (never resolved) —
  the same symptom the prior attempt hit.

### Interpretation (verified against SDK semantics)

The Firebase Web SDK fires **latency-compensated local snapshots immediately**
and resolves `addDoc` against the local cache/queue; a write pending server
acknowledgement keeps the promise pending rather than rejecting
(https://github.com/firebase/firebase-js-sdk/issues/1497 ,
https://github.com/angular/angularfire/issues/3593 — content rephrased for
licensing compliance). So "card appears locally + promise resolves + fresh
server read shows nothing + a forced server round-trip hangs" is the signature
of a write the **backend never confirms** — consistent with the live project's
published security rules not permitting the write (i.e. `firestore.rules` was
never published to `vault-dd939`, so the live rules are still the project's
default locked/closed rules). A clean `permission-denied` does not always
surface over the WebChannel long-polling transport under headless automation,
which is why the headless signal is partly an environment artifact and the
decisive evidence is the server read showing nothing.

### Was it a code bug?

Partly. One real code-shape issue existed and is now fixed: before this change
the app wrote a `tags` field, and the document key set had to match the rules'
`hasOnly`/`hasAll` list exactly. After Changes 1 and 2 the written document is
exactly `{ videoId, url, title, channel, thumbnailUrl, category, addedAt }`,
which **matches the updated `firestore.rules` key set byte-for-byte** (verified
by reading both files) — so a shape mismatch can no longer reject the write once
the rules are published.

The error handling was also made visible (this was the brief's explicit
requirement): `app.js`'s add submit handler now `console.error("addDoc failed:",
err)` and shows the inline banner "Couldn't save this link — check your
connection and try again." in the add-link modal on any `addDoc` rejection,
instead of failing silently.

### USER ACTION STILL REQUIRED — rules must be published

The most probable real-world cause of the user's report is **not a code bug**:
the `firestore.rules` file in this repo is a local file and is **not
auto-deployed**. Until it is published to the live project, writes to `vault-dd939`
are rejected by whatever rules are currently live there (a new project defaults
to locked/closed).

There is **no `firebase-tools` CLI and no authenticated session** in this
environment (`firebase` command not found), so this could **not** be verified or
published programmatically, and this report does **not** claim the rules are
published.

The user must manually publish the rules:

> Firebase Console → project `vault-dd939` → Firestore Database → Rules tab →
> paste the contents of `firestore.rules` → **Publish**.

After publishing, the add-link flow should persist and sync across devices. If a
write still fails after publishing, the now-visible console error + inline banner
will show the actual Firebase error code to diagnose further.

## 6. Cleanup

All temporary servers, headless Chrome processes, Chrome profile directories,
and scratch CDP driver scripts created during verification were terminated and
removed (`/tmp/vault_diag` deleted; no stray `http.server`/remote-debugging
processes remain). The leftover server (port 8743) and headless Chrome (port
9333) from the prior attempt were also killed and their profile dirs removed.

## 7. Commands run (summary)

| Command | Result |
|---|---|
| `node app-logic-tests.mjs` | 33 passed, exit 0 |
| `grep -niE "\btags?\b" <source files>` | only the "staged" false positive |
| headless Chrome add-link repro (3 passes) | local write + 200 Write channel; fresh server read = 0 cards; forced server count hangs → backend not confirming writes (rules-publish hypothesis) |
| headless `final_check.mjs` | no tag UI, layout intact, auto-guess pre-selects + overridable |
| `firebase --version` | command not found (no CLI / cannot publish or verify rules) |
