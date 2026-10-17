// TubeStash — YouTube Link Vault
// Firebase JS SDK v10.x via CDN ES modules. No analytics, no auth, no API key.
//
// Pure, DOM/Firebase-free helpers live in app-logic.js so they can be unit
// tested under plain Node (Node's default ESM loader can't resolve the
// https:// CDN imports below, so this file itself is not importable outside
// a browser — app-logic.js has no such import and is).

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import {
  CATEGORIES,
  CATEGORY_ICONS,
  extractVideoId,
  categoryColor,
  guessCategory,
  filterLinks,
  thumbnailUrlFor,
  fetchMetadata,
} from "./app-logic.js";

export { CATEGORIES, extractVideoId, categoryColor, guessCategory, filterLinks, thumbnailUrlFor, fetchMetadata };

const firebaseConfig = {
  apiKey: "AIzaSyDaaVHzL02tsIRBhCqmVXjxfpsVylyLpYA",
  authDomain: "vault-dd939.firebaseapp.com",
  projectId: "vault-dd939",
  storageBucket: "vault-dd939.firebasestorage.app",
  messagingSenderId: "575094649019",
  appId: "1:575094649019:web:401833b4933965e64fb99e",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const linksRef = collection(db, "links");

// ==========================================================================
// DOM wiring
// ==========================================================================

wireUpApp();

function wireUpApp() {
  const state = {
    links: [],
    firstSnapshotReceived: false,
    activeCategory: "All",
    searchTerm: "",
    playingVideoId: null,
    playingDocId: null,
    playingLink: null,
  };

  const el = {
    hamburgerBtn: document.getElementById("hamburger-btn"),
    sidebar: document.getElementById("sidebar"),
    sidebarBackdrop: document.getElementById("sidebar-backdrop"),
    categoryNavList: document.getElementById("category-nav-list"),
    header: document.querySelector(".app-header"),
    mobileSearchToggle: document.getElementById("mobile-search-toggle"),
    searchForm: document.getElementById("search-form"),
    searchInput: document.getElementById("search-input"),
    addLinkBtn: document.getElementById("add-link-btn"),
    emptyVaultAddBtn: document.getElementById("empty-vault-add-btn"),
    clearFiltersBtn: document.getElementById("clear-filters-btn"),

    skeletonGrid: document.getElementById("skeleton-grid"),
    cardGrid: document.getElementById("card-grid"),
    emptyVault: document.getElementById("empty-vault"),
    emptyFiltered: document.getElementById("empty-filtered"),
    gridStatus: document.getElementById("grid-status"),

    toast: document.getElementById("toast"),
    actionToast: document.getElementById("action-toast"),
    actionToastMsg: document.getElementById("action-toast-msg"),
    actionToastCategory: document.getElementById("action-toast-category"),
    actionToastUndo: document.getElementById("action-toast-undo"),

    addLinkModal: document.getElementById("add-link-modal"),
    addLinkForm: document.getElementById("add-link-form"),
    urlInput: document.getElementById("url-input"),
    urlError: document.getElementById("url-error"),
    fetchStatus: document.getElementById("fetch-status"),
    saveError: document.getElementById("save-error"),

    playbackModal: document.getElementById("playback-modal"),
    playerWrap: document.getElementById("player-wrap"),
    playerTitle: document.getElementById("player-title"),
    playerChannel: document.getElementById("player-channel"),
    playerCategory: document.getElementById("player-category"),
    playerRemoveBtn: document.getElementById("player-remove-btn"),
  };


  // ---- Sidebar: populate category nav ----
  for (const cat of CATEGORIES) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.className = "nav-item";
    btn.dataset.category = cat;
    btn.innerHTML = `
      <svg class="nav-icon" viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">${CATEGORY_ICONS[cat] ?? ""}</svg>
      <span class="nav-label">${cat}</span>
    `;
    li.appendChild(btn);
    el.categoryNavList.appendChild(li);
  }

  // ---- Action toast: populate category select ----
  for (const cat of CATEGORIES) {
    const toastOpt = document.createElement("option");
    toastOpt.value = cat;
    toastOpt.textContent = cat;
    el.actionToastCategory.appendChild(toastOpt);
  }

  // ---- Loading skeleton (8 cards) ----
  for (let i = 0; i < 8; i++) {
    const card = document.createElement("div");
    card.className = "video-card skeleton";
    card.innerHTML = `
      <div class="thumbnail-wrap"></div>
      <div class="card-meta">
        <div class="card-info">
          <div class="skeleton-line"></div>
          <div class="skeleton-line short"></div>
        </div>
      </div>
    `;
    el.skeletonGrid.appendChild(card);
  }
  el.skeletonGrid.hidden = false;

  // ==========================================================================
  // Sidebar toggle (hamburger)
  // ==========================================================================

  function isMobile() {
    return window.matchMedia("(max-width: 768px)").matches;
  }

  function openSidebarOverlay() {
    el.sidebar.classList.add("is-overlay-open");
    el.sidebarBackdrop.hidden = false;
    el.hamburgerBtn.setAttribute("aria-expanded", "true");
  }

  function closeSidebarOverlay() {
    el.sidebar.classList.remove("is-overlay-open");
    el.sidebarBackdrop.hidden = true;
    el.hamburgerBtn.setAttribute("aria-expanded", "false");
  }

  el.hamburgerBtn.addEventListener("click", () => {
    if (isMobile() || window.matchMedia("(max-width: 1024px)").matches) {
      if (el.sidebar.classList.contains("is-overlay-open")) {
        closeSidebarOverlay();
      } else {
        openSidebarOverlay();
      }
    } else {
      el.sidebar.classList.toggle("is-collapsed");
    }
  });

  el.sidebarBackdrop.addEventListener("click", closeSidebarOverlay);

  // ==========================================================================
  // Category filter + search
  // ==========================================================================

  function setActiveCategory(cat) {
    state.activeCategory = cat;
    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.category === cat);
    });
    renderGrid();
    closeSidebarOverlay();
  }

  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => setActiveCategory(btn.dataset.category));
  });

  let searchDebounceId = null;
  el.searchInput.addEventListener("input", () => {
    clearTimeout(searchDebounceId);
    searchDebounceId = setTimeout(() => {
      const raw = el.searchInput.value.trim();
      // If the box contains a YouTube link, switch to "add" affordance and
      // stop filtering by the raw URL (which would match nothing anyway).
      if (raw && extractVideoId(raw)) {
        el.header.classList.add("search-is-url");
        state.searchTerm = "";
        renderGrid();
        return;
      }
      el.header.classList.remove("search-is-url");
      state.searchTerm = el.searchInput.value;
      renderGrid();
    }, 200);
  });

  // Submit (Enter): if the box holds a valid YouTube URL, add it through the
  // same pipeline as the Add button (fetch, guess category, dedup, toast);
  // otherwise just apply the search filter.
  el.searchForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const raw = el.searchInput.value.trim();
    const videoId = raw ? extractVideoId(raw) : null;
    if (videoId) {
      el.searchInput.value = "";
      el.header.classList.remove("search-is-url");
      state.searchTerm = "";
      renderGrid();
      await addByUrl(videoId, raw);
      return;
    }
    state.searchTerm = el.searchInput.value;
    renderGrid();
  });

  el.mobileSearchToggle.addEventListener("click", () => {
    el.header.classList.toggle("search-open");
    if (el.header.classList.contains("search-open")) {
      el.searchInput.focus();
    }
  });

  el.clearFiltersBtn.addEventListener("click", () => {
    state.searchTerm = "";
    el.searchInput.value = "";
    setActiveCategory("All");
  });

  // ==========================================================================
  // Rendering
  // ==========================================================================

  function renderGrid() {
    if (!state.firstSnapshotReceived) return;

    el.skeletonGrid.hidden = true;

    if (state.links.length === 0) {
      el.cardGrid.hidden = true;
      el.emptyFiltered.hidden = true;
      el.emptyVault.hidden = false;
      return;
    }
    el.emptyVault.hidden = true;

    const filtered = filterLinks(state.links, {
      category: state.activeCategory,
      searchTerm: state.searchTerm,
    });

    if (filtered.length === 0) {
      el.cardGrid.hidden = true;
      el.emptyFiltered.hidden = false;
      return;
    }
    el.emptyFiltered.hidden = true;
    el.cardGrid.hidden = false;

    el.cardGrid.innerHTML = "";
    for (const link of filtered) {
      el.cardGrid.appendChild(buildCard(link));
    }
    el.gridStatus.textContent = `${filtered.length} video${filtered.length === 1 ? "" : "s"} shown`;
  }

  function buildCard(link) {
    const card = document.createElement("div");
    card.className = "video-card";
    card.dataset.docId = link.id;

    const color = categoryColor(link.category);

    card.innerHTML = `
      <div class="thumbnail-wrap">
        <img class="thumbnail" src="${escapeAttr(link.thumbnailUrl)}" alt="${escapeAttr(link.title)}" loading="lazy" />
        <div class="play-overlay">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="#fff" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
        </div>
        <button class="remove-btn" aria-label="Remove ${escapeAttr(link.title)}" title="Remove from stash" data-action="remove">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      </div>
      <div class="card-meta">
        <div class="card-info">
          <h3 class="card-title">${escapeHtml(link.title)}</h3>
          <p class="card-channel">${escapeHtml(link.channel || "")}</p>
          <div class="card-sub">
            <span class="category-pill" style="background:${color}">${escapeHtml(link.category)}</span>
          </div>
        </div>
      </div>
    `;

    card.querySelector('[data-action="remove"]').addEventListener("click", (e) => {
      e.stopPropagation();
      removeLink(link);
    });

    card.addEventListener("click", () => openPlaybackModal(link));

    return card;
  }

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[c]);
  }
  function escapeAttr(str) {
    return escapeHtml(str);
  }

  // Instant remove, no confirmation. Captures the full link so the action
  // toast can offer Undo (a re-add with the same fields — a new doc id and
  // addedAt, which is fine). `link` is the object built from the snapshot.
  async function removeLink(link) {
    const docId = typeof link === "string" ? link : link.id;
    try {
      await deleteDoc(doc(db, "links", docId));
      if (state.playingDocId === docId) {
        closePlaybackModal();
      }
      if (typeof link === "object" && link) {
        showRemovedToast(link);
      }
    } catch {
      showToast("Couldn't remove this link — try again.");
      setTimeout(hideToast, 3000);
    }
  }

  // ==========================================================================
  // Firestore real-time listener (sole render trigger)
  // ==========================================================================

  // Per-load shuffle: a seed fixed once when the page loads gives the grid a
  // fresh random order on each visit, while staying stable across snapshots
  // within the same session so adds/removes don't reshuffle everything. This
  // is purely a display-order change computed in the browser — the Firestore
  // query still orders by addedAt and no data is written or modified.
  const shuffleSeed = Math.floor(Math.random() * 0xffffffff) >>> 0;

  // Deterministic 32-bit hash of (docId + seed) -> a stable sort key per doc
  // for this session's seed. Same doc + same seed = same key all session;
  // a new load picks a new seed, hence a new order.
  function shuffleKey(docId) {
    let h = shuffleSeed >>> 0;
    const s = String(docId);
    for (let i = 0; i < s.length; i++) {
      h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
    }
    return h;
  }

  function shuffledByLoad(links) {
    return [...links].sort((a, b) => shuffleKey(a.id) - shuffleKey(b.id));
  }

  const q = query(linksRef, orderBy("addedAt", "desc"));
  onSnapshot(
    q,
    (snapshot) => {
      const raw = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      state.links = shuffledByLoad(raw);
      state.firstSnapshotReceived = true;
      hideToast();
      renderGrid();
    },
    (error) => {
      // Surfaced to devtools so a permission-denied (unpublished/incorrect
      // Firestore rules) or any other listener failure is diagnosable
      // instead of silent.
      console.error("Firestore listener error:", error);

      if (!state.firstSnapshotReceived) {
        // Never got an initial snapshot: don't leave the skeleton spinning
        // forever. Show an explicit, visible error state instead.
        el.skeletonGrid.hidden = true;
        el.cardGrid.hidden = true;
        el.emptyFiltered.hidden = true;
        el.emptyVault.hidden = true;
        showToast(
          error && error.code === "permission-denied"
            ? "Can't load the stash — Firestore rules aren't published yet."
            : "Can't load the stash — check your connection and reload."
        );
        return;
      }

      // Already have data on screen; treat this as a transient drop.
      showToast("Reconnecting…");
    }
  );

  // ==========================================================================
  // Toast
  // ==========================================================================

  function showToast(message) {
    el.toast.textContent = message;
    el.toast.hidden = false;
  }
  function hideToast() {
    el.toast.hidden = true;
  }

  // ==========================================================================
  // Modal infrastructure (shared open/close, focus, escape, backdrop)
  // ==========================================================================

  let lastFocusedBeforeModal = null;

  function openModal(modalEl) {
    lastFocusedBeforeModal = document.activeElement;
    modalEl.hidden = false;
    const firstInput = modalEl.querySelector("input, select, button");
    if (firstInput) firstInput.focus();
  }

  function closeModal(modalEl) {
    modalEl.hidden = true;
    if (lastFocusedBeforeModal && typeof lastFocusedBeforeModal.focus === "function") {
      lastFocusedBeforeModal.focus();
    }
  }

  document.querySelectorAll("[data-close-modal]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const modalId = btn.dataset.closeModal;
      handleModalClose(modalId);
    });
  });

  document.querySelectorAll(".modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        handleModalClose(overlay.id);
      }
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!el.addLinkModal.hidden) {
      handleModalClose("add-link-modal");
    } else if (!el.playbackModal.hidden) {
      handleModalClose("playback-modal");
    }
  });

  function handleModalClose(modalId) {
    if (modalId === "add-link-modal") {
      closeModal(el.addLinkModal);
      resetAddLinkForm();
    } else if (modalId === "playback-modal") {
      closePlaybackModal();
    }
  }

  // ==========================================================================
  // Add-link modal
  // ==========================================================================

  function resetAddLinkForm() {
    el.addLinkForm.reset();
    el.urlError.hidden = true;
    el.fetchStatus.hidden = true;
    el.saveError.hidden = true;
  }

  function openAddLinkModal() {
    resetAddLinkForm();
    openModal(el.addLinkModal);
  }

  el.addLinkBtn.addEventListener("click", openAddLinkModal);
  el.emptyVaultAddBtn.addEventListener("click", openAddLinkModal);

  // Quick-add: a valid URL is saved immediately (no Save step). The action
  // toast then offers Undo and an inline category change. `isAdding` guards
  // against a double-add if the user pastes, then hits Enter before the
  // debounced add fires.
  let isAdding = false;

  let urlDebounceId = null;
  el.urlInput.addEventListener("input", () => {
    clearTimeout(urlDebounceId);
    el.urlError.hidden = true;
    urlDebounceId = setTimeout(handleUrlInput, 400);
  });

  // Enter in the URL field triggers the add immediately (skip the debounce).
  el.addLinkForm.addEventListener("submit", (e) => {
    e.preventDefault();
    clearTimeout(urlDebounceId);
    handleUrlInput();
  });

  // Modal path: validate the typed URL, then delegate to the shared add.
  async function handleUrlInput() {
    if (isAdding) return;

    const rawUrl = el.urlInput.value.trim();
    if (!rawUrl) return;

    const videoId = extractVideoId(rawUrl);
    if (!videoId) {
      el.urlError.hidden = false;
      return;
    }
    el.urlError.hidden = true;
    el.fetchStatus.hidden = false;

    try {
      const added = await addByUrl(videoId, rawUrl);
      closeModal(el.addLinkModal);
      resetAddLinkForm();
      if (added === "error") el.saveError.hidden = false;
    } finally {
      el.fetchStatus.hidden = true;
    }
  }

  // Shared add pipeline used by both the add-link modal and the search box.
  // Dedups against the in-memory state.links (kept in sync by onSnapshot, so
  // no extra Firestore read), then quick-adds. Returns "added", "duplicate",
  // or "error". `isAdding` guards against a double-add from a fast
  // input-then-Enter sequence.
  async function addByUrl(videoId, rawUrl) {
    if (isAdding) return "busy";

    // Duplicate guard: skip the add and notify rather than creating a second
    // document for the same video.
    if (state.links.some((link) => link.videoId === videoId)) {
      showToast("That video is already in your stash.");
      setTimeout(hideToast, 3000);
      return "duplicate";
    }

    isAdding = true;
    try {
      await quickAddLink(videoId, rawUrl);
      return "added";
    } catch (err) {
      // Log the real Firebase error (e.g. permission-denied if
      // firestore.rules hasn't been published yet, invalid-argument for a
      // malformed payload, or a network error) so the failure is
      // diagnosable in devtools instead of silent.
      console.error("quick add failed:", err);
      showToast("Couldn't add this link — check your connection and try again.");
      setTimeout(hideToast, 3000);
      return "error";
    } finally {
      isAdding = false;
    }
  }

  // Fetches metadata, guesses a category, and writes one link document.
  // Titles from oEmbed are usually empty in production (CORS), and Firestore
  // rules reject an empty title, so fall back to a non-empty placeholder the
  // user can correct via the action toast's category editor or by re-adding.
  async function quickAddLink(videoId, rawUrl) {
    const meta = await fetchMetadata(videoId, rawUrl);
    const title = meta.title.trim() || `YouTube video ${videoId}`;
    const channel = meta.channel.trim();
    const category = guessCategory(meta.title, meta.channel);

    const ref = await addDoc(linksRef, {
      videoId,
      url: rawUrl,
      title,
      channel,
      thumbnailUrl: meta.thumbnailUrl,
      category,
      addedAt: serverTimestamp(),
    });

    showActionToast(ref.id, title, category, { videoId, url: rawUrl, channel, thumbnailUrl: meta.thumbnailUrl });
  }

  // ==========================================================================
  // Action toast (quick-add: Undo + inline category change)
  // ==========================================================================

  let actionToastTimerId = null;
  let actionToastDocId = null;
  let actionToastSnapshot = null; // the written fields, for delete+re-add on category change
  let actionToastMode = null; // "added" | "removed" — controls what Undo does

  function shortenTitle(title) {
    return title.length > 40 ? title.slice(0, 39) + "…" : title;
  }

  // "Added" toast: message + inline category change + Undo (Undo deletes).
  function showActionToast(docId, title, category, fields) {
    actionToastMode = "added";
    actionToastDocId = docId;
    actionToastSnapshot = { ...fields, title, category };

    el.actionToastMsg.textContent = `Added “${shortenTitle(title)}”`;
    el.actionToastCategory.value = category;
    el.actionToastCategory.hidden = false;
    el.actionToast.hidden = false;

    clearTimeout(actionToastTimerId);
    actionToastTimerId = setTimeout(hideActionToast, 6000);
  }

  // "Removed" toast: message + Undo (Undo re-adds). No category select.
  function showRemovedToast(link) {
    actionToastMode = "removed";
    actionToastDocId = null;
    actionToastSnapshot = {
      videoId: link.videoId,
      url: link.url,
      title: link.title,
      channel: link.channel || "",
      thumbnailUrl: link.thumbnailUrl,
      category: link.category,
    };

    el.actionToastMsg.textContent = `Removed “${shortenTitle(link.title)}”`;
    el.actionToastCategory.hidden = true;
    el.actionToast.hidden = false;

    clearTimeout(actionToastTimerId);
    actionToastTimerId = setTimeout(hideActionToast, 6000);
  }

  function hideActionToast() {
    el.actionToast.hidden = true;
    actionToastDocId = null;
    actionToastSnapshot = null;
    actionToastMode = null;
    clearTimeout(actionToastTimerId);
  }

  async function reAddFromSnapshot(snap) {
    return addDoc(linksRef, {
      videoId: snap.videoId,
      url: snap.url,
      title: snap.title,
      channel: snap.channel,
      thumbnailUrl: snap.thumbnailUrl,
      category: snap.category,
      addedAt: serverTimestamp(),
    });
  }

  el.actionToastUndo.addEventListener("click", async () => {
    const mode = actionToastMode;
    const docId = actionToastDocId;
    const snap = actionToastSnapshot;
    hideActionToast();
    try {
      if (mode === "added") {
        // Undo an add → delete the doc we just created.
        if (docId) await deleteDoc(doc(db, "links", docId));
      } else if (mode === "removed") {
        // Undo a remove → re-add the captured link.
        if (snap) await reAddFromSnapshot(snap);
      }
    } catch {
      showToast("Couldn't undo — try again.");
      setTimeout(hideToast, 3000);
    }
  });

  // No in-place update exists (rules forbid update), so changing the category
  // deletes the just-added doc and re-adds it with the new category. The new
  // doc id replaces the one the toast is tracking so Undo still works.
  el.actionToastCategory.addEventListener("change", async () => {
    const oldDocId = actionToastDocId;
    const snap = actionToastSnapshot;
    const newCategory = el.actionToastCategory.value;
    if (!oldDocId || !snap || newCategory === snap.category) return;

    clearTimeout(actionToastTimerId);
    try {
      const ref = await reAddFromSnapshot({ ...snap, category: newCategory });
      await deleteDoc(doc(db, "links", oldDocId));
      // Keep the toast open and tracking the new doc for a further change/undo.
      actionToastDocId = ref.id;
      actionToastSnapshot = { ...snap, category: newCategory };
      actionToastTimerId = setTimeout(hideActionToast, 6000);
    } catch {
      showToast("Couldn't change the category — try again.");
      setTimeout(hideToast, 3000);
      hideActionToast();
    }
  });

  // ==========================================================================
  // Playback modal
  // ==========================================================================

  function openPlaybackModal(link) {
    state.playingVideoId = link.videoId;
    state.playingDocId = link.id;
    state.playingLink = link;

    el.playerWrap.innerHTML = `
      <iframe
        src="https://www.youtube.com/embed/${encodeURIComponent(link.videoId)}"
        title="${escapeAttr(link.title)}"
        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen
      ></iframe>
    `;
    el.playerTitle.textContent = link.title;
    el.playerChannel.textContent = link.channel || "";
    el.playerCategory.textContent = link.category;
    el.playerCategory.style.background = categoryColor(link.category);

    openModal(el.playbackModal);
  }

  function closePlaybackModal() {
    el.playerWrap.innerHTML = ""; // tears down the iframe so playback stops
    state.playingVideoId = null;
    state.playingDocId = null;
    state.playingLink = null;
    closeModal(el.playbackModal);
  }

  // Instant remove from the playback modal — no confirmation. The Undo toast
  // (shown by removeLink) is the safety net. removeLink also tears down the
  // playback modal when the removed doc is the one playing.
  el.playerRemoveBtn.addEventListener("click", async () => {
    const link = state.playingLink;
    if (link) await removeLink(link);
  });
}
