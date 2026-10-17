// Pure, DOM-free and Firebase-free helpers for the Vault app.
// No CDN imports here on purpose: this module is what app-logic-tests.mjs
// imports directly under plain Node, since Node's default ESM loader can't
// resolve the https:// CDN imports that app.js needs for the Firebase SDK.

export const CATEGORIES = [
  "Music",
  "Gaming",
  "Education",
  "Tech",
  "Comedy",
  "Sports",
  "News",
  "Cooking",
  "Travel",
  "Fitness",
  "Movies/TV",
  "Other",
];

export const CATEGORY_ICONS = {
  Music:
    '<path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/>',
  Gaming:
    '<path d="M21 6H3a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2zM8 14H6v2H4.5v-2H2.5v-1.5h2V10H6v2.5h2V14zm7.5 1a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3-3a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>',
  Education:
    '<path d="M12 3 1 9l11 6 9-4.91V17h2V9L12 3zM5 13.18v4.72L12 21l7-3.1v-4.72L12 17l-7-3.82z"/>',
  Tech:
    '<path d="M9.4 16.6 4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0L19.2 12l-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/>',
  Comedy:
    '<path d="M12 1a11 11 0 1 0 0 22 11 11 0 0 0 0-22zm-4 7.5A1.5 1.5 0 1 1 8 11.5 1.5 1.5 0 0 1 8 8.5zm9 0A1.5 1.5 0 1 1 17 11.5 1.5 1.5 0 0 1 17 8.5zM12 18c-2.3 0-4.3-1.2-5.4-3h10.8c-1.1 1.8-3.1 3-5.4 3z"/>',
  Sports:
    '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.93 6h-3.1a14.9 14.9 0 0 0-1.3-3.36A8.03 8.03 0 0 1 18.93 8zM12 4.04A13 13 0 0 1 13.7 8h-3.4A13 13 0 0 1 12 4.04zM4.26 14A7.96 7.96 0 0 1 4 12c0-.69.09-1.36.26-2h3.38A15.6 15.6 0 0 0 7.5 12c0 .68.05 1.35.14 2H4.26zm.81 2h3.1a14.9 14.9 0 0 0 1.3 3.36A8.03 8.03 0 0 1 5.07 16zM9.6 8H9.1a14.9 14.9 0 0 1 1.3-3.36c.1.02.2.02.3.02s.2 0 .3-.02A14.9 14.9 0 0 1 12.3 8h-2.7zM12 19.96A13 13 0 0 1 10.3 16h3.4A13 13 0 0 1 12 19.96zM9.5 14c-.09-.65-.14-1.32-.14-2s.05-1.35.14-2h5c.09.65.14 1.32.14 2s-.05 1.35-.14 2h-5zm5.8 5.36A14.9 14.9 0 0 0 16.6 16h3.1a8.03 8.03 0 0 1-4.4 3.36zM16.36 12c0-.68-.05-1.35-.14-2h3.38c.17.64.26 1.31.26 2s-.09 1.36-.26 2h-3.38c.09-.65.14-1.32.14-2z"/>',
  News:
    '<path d="M4 4h13a2 2 0 0 1 2 2v12.5A1.5 1.5 0 0 0 20.5 20H5a3 3 0 0 1-3-3V5a1 1 0 0 1 1-1zm2 3v2h7V7H6zm0 4v2h7v-2H6zm0 4v2h4v-2H6z"/>',
  Cooking:
    '<path d="M18 8h-1V3H7v5H6a4 4 0 0 0-4 4v2a4 4 0 0 0 4 4h12a4 4 0 0 0 4-4v-2a4 4 0 0 0-4-4zM9 5h6v3H9V5zm11 9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2zM4 20h16v2H4z"/>',
  Travel:
    '<path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 1 0-3 0V9l-8 5v2l8-2.5V18l-2 1.5V21l3.5-1 3.5 1v-1.5L13 18v-4.5z"/>',
  Fitness:
    '<path d="M20.57 14.86 22 13.43 20.57 12 17 15.57 8.43 7 12 3.43 10.57 2 9.14 3.43 7.71 2 5.57 4.14 4.14 2.71 2.71 4.14l1.43 1.43L2 7.71l1.43 1.43L2 10.57l1.43 1.43L7 8.43 15.57 17 12 20.57 13.43 22l1.43-1.43L16.29 22l2.14-2.14 1.43 1.43 1.43-1.43-1.43-1.43L22 16.29z"/>',
  "Movies/TV":
    '<path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2z"/>',
  Other:
    '<path d="M17.63 5.84C17.27 5.33 16.67 5 16 5L5 5.01C3.9 5.01 3 5.9 3 7v10c0 1.1.9 1.99 2 1.99L16 19c.67 0 1.27-.33 1.63-.84L22 12l-4.37-6.16z"/>',
};

const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;
const OEMBED_TIMEOUT_MS = 4000;
const MAX_TAGS = 15;
const MAX_TAG_LENGTH = 50;

/**
 * Parses a YouTube video ID out of a URL string.
 * Supports youtube.com/watch?v=, youtu.be/, youtube.com/shorts/,
 * youtube.com/live/, m.youtube.com, music.youtube.com, and bare
 * youtube.com/?v=. Returns null for anything else (playlists without
 * a `v` param, channel URLs, non-YouTube domains, malformed input).
 * @param {string} rawUrl
 * @returns {string|null}
 */
export function extractVideoId(rawUrl) {
  let u;
  try {
    u = new URL(String(rawUrl).trim());
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");

  if (host === "youtu.be") {
    const id = u.pathname.slice(1).split("/")[0];
    return VIDEO_ID_RE.test(id) ? id : null;
  }
  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    if (u.pathname === "/watch") {
      const id = u.searchParams.get("v");
      return id && VIDEO_ID_RE.test(id) ? id : null;
    }
    if (u.pathname.startsWith("/shorts/")) {
      const id = u.pathname.split("/")[2] ?? null;
      return id && VIDEO_ID_RE.test(id) ? id : null;
    }
    if (u.pathname.startsWith("/live/")) {
      const id = u.pathname.split("/")[2] ?? null;
      return id && VIDEO_ID_RE.test(id) ? id : null;
    }
    if (u.pathname === "/" || u.pathname === "") {
      const id = u.searchParams.get("v");
      return id && VIDEO_ID_RE.test(id) ? id : null;
    }
  }
  return null;
}

/**
 * Deterministic, collision-avoiding category -> color mapping using
 * golden-angle hue spacing indexed into the fixed CATEGORIES array.
 * @param {string} category
 * @returns {string} an hsl() color string
 */
export function categoryColor(category) {
  const index = CATEGORIES.indexOf(category);
  const hue = (index * 137.5) % 360;
  return `hsl(${hue}, 45%, 45%)`;
}

/**
 * Parses a freeform comma-separated tag string into a normalized array:
 * trimmed, lowercased, empty entries dropped, capped at MAX_TAGS entries
 * and MAX_TAG_LENGTH characters each.
 * @param {string} rawTags
 * @returns {string[]}
 */
export function parseTags(rawTags) {
  if (!rawTags) return [];
  return String(rawTags)
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0)
    .map((t) => t.slice(0, MAX_TAG_LENGTH))
    .slice(0, MAX_TAGS);
}

/**
 * Pure filter over an in-memory links array by category and search term.
 * @param {Array<object>} links
 * @param {{category?: string, searchTerm?: string}} opts
 * @returns {Array<object>}
 */
export function filterLinks(links, { category = "All", searchTerm = "" } = {}) {
  const term = searchTerm.trim().toLowerCase();
  return links.filter((link) => {
    if (category !== "All" && link.category !== category) return false;
    if (!term) return true;
    const haystacks = [link.title ?? "", link.channel ?? "", ...(link.tags ?? [])];
    return haystacks.some((h) => String(h).toLowerCase().includes(term));
  });
}

/**
 * Builds the always-derived thumbnail URL for a given video ID.
 * @param {string} videoId
 * @returns {string}
 */
export function thumbnailUrlFor(videoId) {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

/**
 * Fetches title/channel metadata via YouTube oEmbed (no API key), with a
 * bounded timeout. Falls back to empty strings on any failure (CORS
 * rejection, network error, non-200, malformed JSON, or timeout) so the
 * UI has exactly one "oEmbed didn't give us anything" branch to handle.
 * The thumbnail is never dependent on oEmbed — it's derived from the ID.
 * @param {string} videoId
 * @param {string} originalUrl
 * @returns {Promise<{title: string, channel: string, thumbnailUrl: string}>}
 */
export async function fetchMetadata(videoId, originalUrl) {
  const thumbnailUrl = thumbnailUrlFor(videoId);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OEMBED_TIMEOUT_MS);
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(originalUrl)}&format=json`;
    const res = await fetch(oembedUrl, { signal: controller.signal });
    if (!res.ok) throw new Error("oembed-failed");
    const data = await res.json();
    return {
      title: typeof data.title === "string" ? data.title : "",
      channel: typeof data.author_name === "string" ? data.author_name : "",
      thumbnailUrl,
    };
  } catch {
    return { title: "", channel: "", thumbnailUrl };
  } finally {
    clearTimeout(timeoutId);
  }
}
