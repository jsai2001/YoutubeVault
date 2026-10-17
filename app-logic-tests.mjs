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
import { extractVideoId, categoryColor, parseTags, filterLinks, CATEGORIES } from "./app-logic.js";

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

// ---- parseTags ----

test("parseTags: comma-split, trimmed, lowercased", () => {
  assert.deepStrictEqual(parseTags(" Foo, Bar ,BAZ"), ["foo", "bar", "baz"]);
});

test("parseTags: empty entries dropped", () => {
  assert.deepStrictEqual(parseTags("foo,,  ,bar"), ["foo", "bar"]);
});

test("parseTags: caps at 15 tags", () => {
  const many = Array.from({ length: 20 }, (_, i) => `tag${i}`).join(",");
  assert.strictEqual(parseTags(many).length, 15);
});

test("parseTags: caps at 50 chars per tag", () => {
  const longTag = "a".repeat(80);
  assert.strictEqual(parseTags(longTag)[0].length, 50);
});

test("parseTags: empty/undefined input returns empty array", () => {
  assert.deepStrictEqual(parseTags(""), []);
  assert.deepStrictEqual(parseTags(undefined), []);
});

// ---- filterLinks ----

const sampleLinks = [
  { id: "1", title: "Lo-fi Beats", channel: "ChillHop", category: "Music", tags: ["lofi", "chill"] },
  { id: "2", title: "React Tutorial", channel: "DevEd", category: "Tech", tags: ["react", "js"] },
  { id: "3", title: "Cooking Pasta", channel: "ChefLife", category: "Cooking", tags: ["pasta", "italian"] },
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

test("filterLinks: search by tag", () => {
  const result = filterLinks(sampleLinks, { category: "All", searchTerm: "chill" });
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].id, "1");
});

test("filterLinks: category + search combined", () => {
  const result = filterLinks(sampleLinks, { category: "Music", searchTerm: "lofi" });
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].id, "1");
});

test("filterLinks: no matches returns empty array", () => {
  const result = filterLinks(sampleLinks, { category: "All", searchTerm: "nonexistent" });
  assert.strictEqual(result.length, 0);
});

console.log(`\n${passed} test(s) passed.`);
