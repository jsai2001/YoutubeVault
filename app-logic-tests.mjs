// Dependency-free unit tests for the pure helpers used by app.js.
// Run with: node app-logic-tests.mjs
// Not shipped as part of the deployed UI; harmless if included.
//
// Imports from app-logic.js, not app.js: app.js pulls in the Firebase SDK
// via https:// CDN ES module imports, which Node's default ESM loader
// cannot resolve. app-logic.js holds the same pure functions (re-exported
// by app.js for the browser) with no such import, so it loads directly
// under plain Node.

import assert from "node:assert";
import { extractVideoId, categoryColor, guessCategory, filterLinks, CATEGORIES } from "./app-logic.js";

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`FAIL - ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

// ---- extractVideoId ----

test("extractVideoId: youtube.com/watch?v=", () => {
  assert.strictEqual(
    extractVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    "dQw4w9WgXcQ"
  );
});

test("extractVideoId: youtube.com/watch?v= with extra params", () => {
  assert.strictEqual(
    extractVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=PL123"),
    "dQw4w9WgXcQ"
  );
});

test("extractVideoId: youtu.be/", () => {
  assert.strictEqual(extractVideoId("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
});

test("extractVideoId: youtu.be/ with query string", () => {
  assert.strictEqual(
    extractVideoId("https://youtu.be/dQw4w9WgXcQ?si=abc123"),
    "dQw4w9WgXcQ"
  );
});

test("extractVideoId: youtube.com/shorts/", () => {
  assert.strictEqual(
    extractVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ"),
    "dQw4w9WgXcQ"
  );
});

test("extractVideoId: youtube.com/live/", () => {
  assert.strictEqual(
    extractVideoId("https://www.youtube.com/live/dQw4w9WgXcQ"),
    "dQw4w9WgXcQ"
  );
});

test("extractVideoId: bare playlist URL returns null", () => {
  assert.strictEqual(
    extractVideoId("https://www.youtube.com/playlist?list=PL123456"),
    null
  );
});

test("extractVideoId: channel URL returns null", () => {
  assert.strictEqual(
    extractVideoId("https://www.youtube.com/channel/UC1234567890"),
    null
  );
});

test("extractVideoId: non-YouTube domain returns null", () => {
  assert.strictEqual(extractVideoId("https://vimeo.com/12345678"), null);
});

test("extractVideoId: javascript: scheme returns null", () => {
  assert.strictEqual(extractVideoId("javascript:alert(1)"), null);
});

test("extractVideoId: ftp: scheme returns null", () => {
  assert.strictEqual(extractVideoId("ftp://youtube.com/watch?v=dQw4w9WgXcQ"), null);
});

test("extractVideoId: malformed input returns null", () => {
  assert.strictEqual(extractVideoId("not a url"), null);
});

// ---- categoryColor ----

test("categoryColor: deterministic across the 12 presets", () => {
  for (const cat of CATEGORIES) {
    const a = categoryColor(cat);
    const b = categoryColor(cat);
    assert.strictEqual(a, b);
    assert.match(a, /^hsl\(\d+(\.\d+)?, 45%, 45%\)$/);
  }
});

test("categoryColor: distinct hues for distinct categories", () => {
  const colors = new Set(CATEGORIES.map(categoryColor));
  assert.strictEqual(colors.size, CATEGORIES.length);
});

// ---- guessCategory ----

test("guessCategory: Music", () => {
  assert.strictEqual(guessCategory("New Song - Official Audio", "SomeArtist"), "Music");
});

test("guessCategory: Gaming", () => {
  assert.strictEqual(guessCategory("Minecraft Let's Play Episode 1", "GamerChannel"), "Gaming");
});

test("guessCategory: Education", () => {
  assert.strictEqual(guessCategory("Python Tutorial for Beginners", "LearnWithMe"), "Education");
});

test("guessCategory: Tech", () => {
  assert.strictEqual(guessCategory("iPhone 15 Unboxing and Review", "TechDaily"), "Tech");
});

test("guessCategory: Comedy", () => {
  assert.strictEqual(guessCategory("Funny Prank Compilation", "LaughTrack"), "Comedy");
});

test("guessCategory: Sports", () => {
  assert.strictEqual(guessCategory("NBA Highlights Tonight", "SportsCenter"), "Sports");
});

test("guessCategory: News", () => {
  assert.strictEqual(guessCategory("Breaking News Report", "NewsNetwork"), "News");
});

test("guessCategory: Cooking", () => {
  assert.strictEqual(
    guessCategory("Full Pasta Recipe Tutorial", "ChefLife"),
    "Cooking"
  );
});

test("guessCategory: Travel", () => {
  assert.strictEqual(guessCategory("Backpacking Through Japan Vlog", "WanderLust"), "Travel");
});

test("guessCategory: Fitness", () => {
  assert.strictEqual(guessCategory("Full Body Workout at the Gym", "FitLife"), "Fitness");
});

test("guessCategory: Movies/TV", () => {
  assert.strictEqual(guessCategory("Official Trailer - Season 2", "StreamingNetwork"), "Movies/TV");
});

test("guessCategory: Other (no keyword match)", () => {
  assert.strictEqual(guessCategory("Random words with no keyword match", "SomeChannel"), "Other");
});

test("guessCategory: case-insensitive matching", () => {
  assert.strictEqual(guessCategory("FULL PASTA RECIPE TUTORIAL", "CHEFLIFE"), "Cooking");
});

// ---- filterLinks ----

const sampleLinks = [
  { id: "1", title: "Lo-fi Beats", channel: "ChillHop", category: "Music" },
  { id: "2", title: "React Tutorial", channel: "DevEd", category: "Tech" },
  { id: "3", title: "Cooking Pasta", channel: "ChefLife", category: "Cooking" },
];

test("filterLinks: category filter", () => {
  const result = filterLinks(sampleLinks, { category: "Tech" });
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].id, "2");
});

test("filterLinks: 'All' category returns everything", () => {
  assert.strictEqual(filterLinks(sampleLinks, { category: "All" }).length, 3);
});

test("filterLinks: search by title", () => {
  const result = filterLinks(sampleLinks, { category: "All", searchTerm: "pasta" });
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].id, "3");
});

test("filterLinks: search by channel", () => {
  const result = filterLinks(sampleLinks, { category: "All", searchTerm: "deved" });
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].id, "2");
});

test("filterLinks: category + search combined", () => {
  const result = filterLinks(sampleLinks, { category: "Music", searchTerm: "beats" });
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].id, "1");
});

test("filterLinks: no matches returns empty array", () => {
  const result = filterLinks(sampleLinks, { category: "All", searchTerm: "nonexistent" });
  assert.strictEqual(result.length, 0);
});

test("filterLinks: multi-term AND matches words in any order", () => {
  // "beats lo-fi" — both words present in title "Lo-fi Beats", order-independent.
  const result = filterLinks(sampleLinks, { category: "All", searchTerm: "beats lo-fi" });
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].id, "1");
});

test("filterLinks: multi-term requires ALL words to match", () => {
  // "pasta react" — no single link has both words, so nothing matches.
  const result = filterLinks(sampleLinks, { category: "All", searchTerm: "pasta react" });
  assert.strictEqual(result.length, 0);
});

test("filterLinks: search matches category name", () => {
  // "music" isn't in the title/channel of link 1, only its category.
  const result = filterLinks(sampleLinks, { category: "All", searchTerm: "music" });
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].id, "1");
});

test("filterLinks: term spanning title + category matches", () => {
  // "cooking pasta" — "pasta" from title, "cooking" from both title and category.
  const result = filterLinks(sampleLinks, { category: "All", searchTerm: "cooking pasta" });
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].id, "3");
});

test("filterLinks: whitespace-only term matches all", () => {
  assert.strictEqual(filterLinks(sampleLinks, { searchTerm: "   " }).length, 3);
});

console.log(`\n${passed} test(s) passed.`);
