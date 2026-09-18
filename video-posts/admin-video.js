/* ================================================================
   JOYIN ADMIN — VIDEO POSTS MODULE  (video-posts/admin-video.js)
   Manages the /video-posts Firestore collection:
     - Load all video posts, batch-resolve usernames + profile pics
       from /users (not stored on the post document any more)
     - Grid view (TikTok-style) ⟷ Table view (like Users/Posts pages)
     - viewCount displayed in cards, table rows, modal, and stat strip
     - Preview a video in a modal player
     - Delete from Firestore + Cloudinary with confirmation
   ================================================================ */

import { db } from "../js/firebase.js";
import { getVideoPostsPage } from "../js/dashboard.js";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  deleteDoc,
  query,
  orderBy,
  writeBatch,
  increment,
  limit,
  startAfter,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import { deleteCloudinaryVideo } from "../js/deleteCloudinary.js";
import { openContentDeletionModal } from "../js/content-deletion-ui.js";

import {
  showToast,
  showLoading,
  hideLoading,
  showConfirm,
  setButtonLoading,
  skeletonRows,
} from "../js/ui.js";

// ── STATE ─────────────────────────────────────────────────────

let allPosts = [];
let filteredPosts = [];
let userCache = new Map(); // uid → { username, profilePic, ... }
let activePost = null;

let currentPage = 1;
const POSTS_PER_PAGE = 20;
let pageCursors = [null];
let pageCache = new Map();
let hasNextPage = false;
let totalVideos = 0;
let todayVideos = 0;
let loadingPage = false;
let searchTimer;
let currentTimeFilter = "all";
let currentView = "grid"; // 'grid' | 'table'

// ── INIT ──────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  setupEventListeners();
  loadPosts();
});

// ── BATCH USER FETCHER ────────────────────────────────────────

/**
 * Fetches multiple user documents by UID and returns a Map<uid, data>.
 * Runs in parallel chunks of 30 to stay well under Firestore limits.
 * This is how we get up-to-date usernames + profile pics without
 * storing them on each video-post document.
 *
 * @param {string[]} userIds
 * @returns {Promise<Map<string, object>>}
 */
async function batchGetUsers(userIds) {
  const unique = [...new Set(userIds)].filter(Boolean);
  const cache = new Map();
  if (!unique.length) return cache;

  const CHUNK = 30;
  const chunks = [];
  for (let i = 0; i < unique.length; i += CHUNK) {
    chunks.push(unique.slice(i, i + CHUNK));
  }

  await Promise.all(
    chunks.map((chunk) =>
      Promise.all(
        chunk.map(async (uid) => {
          try {
            const snap = await getDoc(doc(db, "users", uid));
            if (snap.exists()) cache.set(uid, snap.data());
          } catch (e) {
            console.warn(`[batchGetUsers] Could not fetch ${uid}:`, e.message);
          }
        }),
      ),
    ),
  );

  console.log(`[batchGetUsers] Resolved ${cache.size}/${unique.length} users`);
  return cache;
}

// ── FIELD HELPERS ─────────────────────────────────────────────

/**
 * Resolves a post's author from the in-memory userCache.
 * Falls back to any stale data stored on the post, then to defaults.
 */
function getAuthor(post) {
  const cached = userCache.get(post.userId);
  return {
    displayName: cached?.displayName || "",
    username: cached?.username || post.username || "Unknown",
    profilePic:
      cached?.profilePic ||
      cached?.photoURL ||
      post.userProfilePic ||
      defaultAvatar(),
  };
}

/**
 * View count loaded from video-posts/{id}/counters/views.
 */
function getViewCount(p) {
  return Number(p.viewsCount) || 0;
}

/**
 * Like count loaded from video-posts/{id}/counters/likes.
 */
function getLikeCount(p) {
  return Number(p.likesCount) || 0;
}

function getCommentCount(p) {
  return Number(p.commentsCount) || 0;
}

// ── DATE HELPERS ──────────────────────────────────────────────

/**
 * Null-safe conversion of a Firestore Timestamp, {seconds} object,
 * ISO string, or any date-like value to a JS Date.
 * Returns null for missing / unparseable values.
 */
function toDate(v) {
  if (!v) return null;
  if (typeof v.toDate === "function") return v.toDate();
  if (typeof v.seconds === "number") return new Date(v.seconds * 1000);
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// ── DATA LOADING ──────────────────────────────────────────────

async function loadPosts(page = 1, force = false) {
  if (loadingPage) return;
  loadingPage = true;
  if (currentView === "grid") {
    document.getElementById("videoGrid").innerHTML =
      buildSkeletonGrid(POSTS_PER_PAGE);
  } else {
    document.getElementById("videoTableBody").innerHTML = skeletonRows(8, 8);
  }

  try {
    let pageData = !force ? pageCache.get(page) : null;
    if (!pageData) {
      pageData = await getVideoPostsPage(
        pageCursors[page - 1] || null,
        POSTS_PER_PAGE,
      );
      pageCache.set(page, pageData);
      pageCursors[page] = pageData.nextCursor;
    }
    allPosts = pageData.posts;
    currentPage = page;
    hasNextPage = pageData.hasNextPage;
    totalVideos = pageData.totalCount;
    todayVideos = pageData.todayCount;

    // Batch-resolve all authors from /users — one parallel fetch round-trip
    const uids = [...new Set(allPosts.map((p) => p.userId).filter(Boolean))];
    userCache = await batchGetUsers(uids);

    applyFilters();
    renderStats();
    render();

    console.log(
      `[video-posts] Loaded ${allPosts.length} videos, resolved ${userCache.size} users`,
    );
  } catch (err) {
    console.error("[video-posts] loadPosts error:", err);
    showToast("Failed to load videos — check console.", "error");
    document.getElementById("videoGrid").innerHTML = `
            <div style="grid-column:1/-1;text-align:center;padding:60px 20px;">
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Could not load videos.<br>
                       <button onclick="location.reload()" style="color:var(--accent-l);background:none;border:none;cursor:pointer;text-decoration:underline;">Retry</button>
                    </p>
                </div>
            </div>`;
  } finally {
    loadingPage = false;
  }
}

// ── FILTER / SORT / SEARCH ─────────────────────────────────────

function applyFilters() {
  const term = document
    .getElementById("searchInput")
    .value.toLowerCase()
    .trim();
  const sortVal = document.getElementById("sortSelect").value;
  const now = new Date();

  // Time range
  let posts = allPosts.filter((p) => {
    const d = toDate(p.createdAt);
    if (!d) return true;
    if (currentTimeFilter === "today") {
      return d >= new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }
    if (currentTimeFilter === "week") {
      return d >= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }
    return true;
  });

  // Search by video ID, caption, or username.
  if (term) {
    posts = posts.filter((p) => {
      const author = getAuthor(p);
      return (
        p.id.toLowerCase().includes(term) ||
        author.username.toLowerCase().includes(term) ||
        (p.text || p.caption || "").toLowerCase().includes(term)
      );
    });
  }

  // Sort
  const [field, dir] = sortVal.split("-");
  posts.sort((a, b) => {
    let aV, bV;
    if (field === "createdAt") {
      aV = toDate(a.createdAt)?.getTime() || 0;
      bV = toDate(b.createdAt)?.getTime() || 0;
    } else if (field === "likeCount") {
      aV = getLikeCount(a);
      bV = getLikeCount(b);
    } else if (field === "viewCount") {
      aV = getViewCount(a);
      bV = getViewCount(b);
    } else if (field === "commentCount") {
      aV = getCommentCount(a);
      bV = getCommentCount(b);
    } else {
      aV = a[field] || 0;
      bV = b[field] || 0;
    }
    return dir === "desc" ? bV - aV : aV - bV;
  });

  filteredPosts = posts;
}

// ── STATS ─────────────────────────────────────────────────────

function renderStats() {
  const total = allPosts.length;

  setText("statTotal", totalVideos);
  setText("statToday", todayVideos);
}

// ── VIEW MODE TOGGLE ──────────────────────────────────────────

/**
 * Master render dispatcher — calls the right renderer based on currentView.
 */
function render() {
  if (currentView === "grid") {
    document.getElementById("videoGrid").style.display = "";
    document.getElementById("videoTableWrap").style.display = "none";
    renderGrid();
  } else {
    document.getElementById("videoGrid").style.display = "none";
    document.getElementById("videoTableWrap").style.display = "";
    renderTableView();
  }
}

function setView(mode) {
  currentView = mode;

  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === mode);
  });

  render();
}

// ── GRID RENDERER ─────────────────────────────────────────────

function renderGrid() {
  const grid = document.getElementById("videoGrid");
  const empty = document.getElementById("emptyState");
  const pagWrap = document.getElementById("paginationWrap");

  if (!filteredPosts.length) {
    grid.innerHTML = "";
    empty.style.display = "block";
    pagWrap.style.display = "none";
    return;
  }

  empty.style.display = "none";
  pagWrap.style.display = "flex";
  const start = 0;
  const end = filteredPosts.length;
  const page = filteredPosts;

  grid.innerHTML = page.map(buildVideoCard).join("");

  updatePagination(filteredPosts.length, start, end);
}

function buildVideoCard(post) {
  const d = toDate(post.createdAt);
  const date = d ? fmtRelDate(d) : "—";
  const dur = fmtDuration(post.duration || 0);
  const views = getViewCount(post);
  const likes = getLikeCount(post);
  const author = getAuthor(post);
  const caption = escHtml((post.text || "").substring(0, 80));

  return `
    <div class="video-card" data-id="${post.id}">
        <div class="video-thumb">
            ${post.thumbnailUrl ? `<img src="${escHtml(post.thumbnailUrl)}" alt="Video thumbnail" loading="lazy">` : `<div class="text-faint text-xs">No thumbnail</div>`}
            <div class="video-thumb__overlay">
                <div class="video-thumb__play"><i class="fas fa-play"></i></div>
            </div>
            <div class="video-thumb__dur">${dur}</div>
        </div>

        <div class="video-card__body">
            <div class="video-card__user">
                <img src="${author.profilePic}" onerror="this.src='${defaultAvatar()}'" alt="">
                <div>
                    <div class="video-card__username">${escHtml(author.displayName || author.username)}</div>
                    ${author.displayName && author.username ? `<div class="text-xs" style="color:var(--text-3);">@${escHtml(author.username)}</div>` : ""}
                    <div class="video-card__date">${date}</div>
                </div>
            </div>
            ${caption ? `<div class="video-card__caption">${caption}</div>` : ""}
            <div class="video-card__stats">
                <span class="video-card__stat"><i class="fas fa-heart"></i> ${fmtCount(likes)}</span>
                <span class="video-card__stat"><i class="fas fa-eye"></i> ${fmtCount(views)}</span>
                <span class="video-card__stat"><i class="fas fa-comment"></i> ${fmtCount(getCommentCount(post))}</span>
            </div>
        </div>

        <div class="video-card__actions">
            <button class="btn btn-primary" data-action="preview" data-id="${post.id}">
                <i class="fas fa-eye"></i> Preview
            </button>
            <button class="btn btn-danger" data-action="delete" data-id="${post.id}">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    </div>`;
}

// ── TABLE RENDERER ────────────────────────────────────────────

function renderTableView() {
  const tbody = document.getElementById("videoTableBody");
  const empty = document.getElementById("emptyState");
  const pagWrap = document.getElementById("paginationWrap");

  if (!filteredPosts.length) {
    tbody.innerHTML = "";
    empty.style.display = "block";
    pagWrap.style.display = "none";
    return;
  }

  empty.style.display = "none";
  pagWrap.style.display = "flex";

  const start = 0;
  const end = filteredPosts.length;
  const page = filteredPosts;

  tbody.innerHTML = page
    .map((p) => {
      const d = toDate(p.createdAt);
      const author = getAuthor(p);
      const views = getViewCount(p);
      const likes = getLikeCount(p);
      const dur = fmtDuration(p.duration || 0);
      const hasVid = p.videoUrl?.trim();
      const preview = escHtml((p.text || "").substring(0, 70));

      return `
        <tr>
            <td>
                <div class="flex-center gap-8">
                    <img src="${author.profilePic}" class="avatar" style="width:32px;height:32px;"
                         onerror="this.src='${defaultAvatar()}'">
                    <div>
                        <div style="font-size:.85rem;font-weight:600;">${escHtml(author.displayName || author.username)}</div>
                        ${author.displayName && author.username ? `<div class="text-xs" style="color:var(--text-3);">@${escHtml(author.username)}</div>` : ""}
                        <div class="text-xs text-faint mono">${p.userId?.substring(0, 10) || "—"}…</div>
                    </div>
                </div>
            </td>
            <td style="max-width:240px;">
                ${
                  preview
                    ? `<p class="post-preview-text">${preview}${(p.text?.length || 0) > 70 ? "…" : ""}</p>`
                    : `<em class="text-faint text-xs">[No caption]</em>`
                }
            </td>
            <td class="text-sm text-muted">
                ${d ? d.toLocaleDateString() : "—"}<br>
                <span class="text-xs text-faint">
                    ${d ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                </span>
            </td>
            <td class="text-sm text-muted">${dur}</td>
            <td>
                <span class="${likes > 0 ? "badge badge-new" : "text-faint text-sm"}">
                    <i class="fas fa-heart"></i> ${fmtCount(likes)}
                </span>
            </td>
            <td class="text-sm">
                <span class="${views > 0 ? "" : "text-faint"}">
                    <i class="fas fa-eye" style="color:var(--accent);margin-right:4px;font-size:.75rem;"></i>${fmtCount(views)}
                </span>
            </td>
            <td class="text-sm text-muted">${fmtCount(getCommentCount(p))}</td>
            <td>
                <div class="flex-center gap-8">
                    <button class="btn btn-icon" title="Preview"
                            data-action="preview" data-id="${p.id}">
                        <i class="fas fa-play"></i>
                    </button>
                    <button class="btn btn-icon btn-danger" title="Delete"
                            data-action="delete" data-id="${p.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    })
    .join("");

  updatePagination(filteredPosts.length, start, end);

  // Attach delegation to table rows too
  document
    .getElementById("videoTableBody")
    .querySelectorAll("[data-action]")
    .forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        if (action === "preview") openPlayer(btn.dataset.id);
        if (action === "delete") deletePost(btn.dataset.id, btn);
      });
    });
}

// ── PAGINATION ────────────────────────────────────────────────

function updatePagination(total, start, end) {
  const pages = Math.max(1, Math.ceil(totalVideos / POSTS_PER_PAGE));
  const rangeStart = total ? (currentPage - 1) * POSTS_PER_PAGE + 1 : 0;
  const rangeEnd = total
    ? Math.min(currentPage * POSTS_PER_PAGE, rangeStart - 1 + total)
    : 0;
  setText("pagFrom", rangeStart);
  setText("pagTo", rangeEnd);
  setText("pagTotal", totalVideos);
  setText("pagInfo", `Page ${currentPage} / ${pages}`);
  document.getElementById("prevBtn").disabled = currentPage === 1;
  document.getElementById("nextBtn").disabled = !hasNextPage;
}

// ── SKELETON ─────────────────────────────────────────────────

function buildSkeletonGrid(rows = 10) {
  return Array.from(
    { length: rows },
    () => `
        <div class="video-card" style="pointer-events:none;">
            <div class="video-thumb skeleton" style="position:relative;padding-top:133%;"></div>
            <div class="video-card__body">
                <div class="skeleton" style="height:14px;width:70%;margin-bottom:8px;border-radius:4px;"></div>
                <div class="skeleton" style="height:12px;width:50%;border-radius:4px;"></div>
            </div>
        </div>`,
  ).join("");
}

// ── VIDEO PLAYER MODAL ────────────────────────────────────────

function openPlayer(postId) {
  const post = allPosts.find((p) => p.id === postId);
  if (!post) return;

  activePost = post;

  const modal = document.getElementById("playerModal");
  const video = document.getElementById("playerVideo");
  const author = getAuthor(post);
  const views = getViewCount(post);
  const likes = getLikeCount(post);
  const d = toDate(post.createdAt);

  video.src = post.videoUrl;
  video.load();

  const rows = [
    ["Post ID", post.id, true],
    ["User ID", post.userId || "—", true],
    ["Display name", author.displayName || author.username, false],
    ["Username", "@" + author.username, false],
    ["Uploaded", d ? fmtFullDate(d) : "—", false],
    ["Duration", fmtDuration(post.duration || 0), false],
    ["Likes", fmtCount(likes), false],
    ["Views", fmtCount(views), false],
    ["Comments", fmtCount(getCommentCount(post)), false],
  ];

  document.getElementById("playerDetails").innerHTML = `
        <div class="player-detail-group">
            <div class="player-detail-group__title">Post Info</div>
            ${rows
              .map(
                ([label, val, mono]) => `
                <div class="player-detail-row">
                    <span class="player-detail-row__label">${label}</span>
                    <span class="player-detail-row__value${mono ? " mono" : ""}">${escHtml(String(val))}</span>
                </div>
            `,
              )
              .join("")}
            ${
              post.text
                ? `
                <div class="player-detail-row" style="flex-direction:column;align-items:flex-start;gap:6px;">
                    <span class="player-detail-row__label">Caption</span>
                    <span class="player-detail-row__value" style="text-align:left;font-weight:400;line-height:1.5;">
                        ${escHtml(post.text)}
                    </span>
                </div>
            `
                : ""
            }
        </div>

        <!-- Author card with live-fetched pic -->
        <div class="player-detail-group">
            <div class="player-detail-group__title">Author</div>
            <div class="player-detail-row" style="gap:12px;padding:14px;">
                <img src="${author.profilePic}"
                     style="width:44px;height:44px;border-radius:50%;object-fit:cover;flex-shrink:0;"
                     onerror="this.src='${defaultAvatar()}'">
                <div>
                    <div style="font-weight:600;font-size:.85rem;">${escHtml(author.displayName || author.username)}</div>
                    ${author.displayName && author.username ? `<div class="text-xs" style="color:var(--text-3);">@${escHtml(author.username)}</div>` : ""}
                    <div class="text-xs text-faint mono">${post.userId || "—"}</div>
                </div>
            </div>
        </div>
    `;

  modal.classList.add("open");
}

function closePlayer() {
  const modal = document.getElementById("playerModal");
  const video = document.getElementById("playerVideo");
  modal.classList.remove("open");
  video.pause();
  video.src = "";
  activePost = null;
}

// ── DELETE ────────────────────────────────────────────────────

async function deletePost(postId, triggerBtn = null) {
  const post = allPosts.find((p) => p.id === postId);
  if (!post) {
    showToast("Post not found.", "error");
    return;
  }

  await openContentDeletionModal({
    id: postId,
    type: "video",
    onDeleted: () => loadPosts(currentPage, true),
  });
  return;

  const confirmed = await showConfirm({
    title: "Delete this video?",
    message:
      "This will permanently remove the video from Firestore and Cloudinary. This cannot be undone.",
    confirmText: "Yes, Delete",
    intent: "danger",
  });
  if (!confirmed) return;

  const restoreBtn = triggerBtn ? setButtonLoading(triggerBtn, "") : () => {};
  showLoading("Deleting video…");

  try {
    // Step 1: Cloudinary (best-effort)
    if (post.cloudinaryId) {
      try {
        await deleteCloudinaryVideo(post.cloudinaryId);
        console.log(
          "[video-posts] Cloudinary asset deleted:",
          post.cloudinaryId,
        );
      } catch (cloudErr) {
        console.warn(
          "[video-posts] Cloudinary delete failed (continuing):",
          cloudErr.message,
        );
      }
    }

    let batch = writeBatch(db);
    let writes = 0;

    async function commitIfNeeded() {
      if (writes >= 490) {
        await batch.commit();
        batch = writeBatch(db);
        writes = 0;
      }
    }

    // Step 2: Decrement owner's likesCount, then drain likes + viewers subcollections
    const likeCount = getLikeCount(post);
    const postOwnerId = post.userId;

    if (likeCount > 0 && postOwnerId) {
      batch.update(doc(db, "users", postOwnerId), {
        likesCount: increment(-likeCount),
      });
      writes++;
    }

    for (const colName of ["likes", "views"]) {
      const colRef = collection(db, "video-posts", postId, colName);
      let lastDoc = null;
      while (true) {
        const q = lastDoc
          ? query(colRef, startAfter(lastDoc), limit(400))
          : query(colRef, limit(400));
        const snap = await getDocs(q);
        if (snap.empty) break;
        for (const d of snap.docs) {
          batch.delete(d.ref);
          writes++;
          await commitIfNeeded();
        }
        lastDoc = snap.docs[snap.docs.length - 1];
        if (snap.docs.length < 400) break;
      }
      console.log(`[video-posts] Drained ${colName} for ${postId}`);
    }

    // Step 3: Comments (track per-commenter counts)
    const commentsRef = collection(db, "video-posts", postId, "comments");
    const commentUserCounts = new Map();
    let lastCommentDoc = null;

    while (true) {
      const q = lastCommentDoc
        ? query(commentsRef, startAfter(lastCommentDoc), limit(400))
        : query(commentsRef, limit(400));
      const snap = await getDocs(q);
      if (snap.empty) break;
      for (const commentDoc of snap.docs) {
        const uid = commentDoc.data().userId;
        if (uid)
          commentUserCounts.set(uid, (commentUserCounts.get(uid) || 0) + 1);
        batch.delete(commentDoc.ref);
        writes++;
        await commitIfNeeded();
      }
      lastCommentDoc = snap.docs[snap.docs.length - 1];
      if (snap.docs.length < 400) break;
    }

    for (const [uid, count] of commentUserCounts) {
      batch.update(doc(db, "users", uid), { commentsCount: increment(-count) });
      writes++;
      await commitIfNeeded();
    }
    console.log(
      `[video-posts] Comment cleanup done for ${commentUserCounts.size} users`,
    );

    // Step 4: Delete the post document itself
    batch.delete(doc(db, "video-posts", postId));
    writes++;

    if (writes > 0) await batch.commit();

    // Update local state
    allPosts = allPosts.filter((p) => p.id !== postId);
    filteredPosts = filteredPosts.filter((p) => p.id !== postId);

    if (!filteredPosts.length && currentPage > 1) currentPage--;

    renderStats();
    render();

    if (activePost?.id === postId) closePlayer();

    showToast("Video deleted successfully.", "success");
  } catch (err) {
    console.error("[video-posts] deletePost error:", err);
    showToast("Failed to delete: " + err.message, "error");
  } finally {
    hideLoading();
    restoreBtn();
  }
}

// ── EVENT LISTENERS ───────────────────────────────────────────

function setupEventListeners() {
  // Search
  document.getElementById("searchInput").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      applyFilters();
      render();
    }, 300);
  });

  // Sort
  document.getElementById("sortSelect").addEventListener("change", () => {
    applyFilters();
    render();
  });

  // Time filter chips
  document.querySelectorAll("[data-time]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll("[data-time]")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentTimeFilter = btn.dataset.time;
      applyFilters();
      render();
    });
  });

  // View toggle (grid / table)
  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => setView(btn.dataset.view));
  });

  // Refresh
  document
    .getElementById("refreshBtn")
    .addEventListener("click", async function () {
      const restore = setButtonLoading(this, "Refreshing…");
      try {
        await loadPosts();
      } finally {
        restore();
      }
    });

  // Grid click delegation (preview + delete)
  document.getElementById("videoGrid").addEventListener("click", (e) => {
    const previewBtn = e.target.closest('[data-action="preview"]');
    const deleteBtn = e.target.closest('[data-action="delete"]');
    const card = e.target.closest(".video-card");

    if (previewBtn) {
      e.stopPropagation();
      openPlayer(previewBtn.dataset.id);
    } else if (deleteBtn) {
      e.stopPropagation();
      deletePost(deleteBtn.dataset.id, deleteBtn);
    } else if (card && !e.target.closest(".video-card__actions")) {
      openPlayer(card.dataset.id);
    }
  });

  // Player close
  document
    .getElementById("closePlayerBtn")
    .addEventListener("click", closePlayer);
  document.getElementById("playerModal").addEventListener("click", (e) => {
    if (e.target === document.getElementById("playerModal")) closePlayer();
  });

  // Player delete button
  document
    .getElementById("playerDeleteBtn")
    .addEventListener("click", async function () {
      if (!activePost) return;
      const restore = setButtonLoading(this, "Deleting…");
      await deletePost(activePost.id, null);
      restore();
    });

  // Pagination
  document.getElementById("prevBtn").addEventListener("click", () => {
    loadPosts(currentPage - 1).then(() =>
      scrollTo({ top: 0, behavior: "smooth" }),
    );
  });
  document.getElementById("nextBtn").addEventListener("click", () => {
    loadPosts(currentPage + 1).then(() =>
      scrollTo({ top: 0, behavior: "smooth" }),
    );
  });

  // Back button
  document
    .getElementById("backBtn")
    .addEventListener("click", () => history.back());

  // ESC closes player
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePlayer();
  });
}

// ── UTILITIES ─────────────────────────────────────────────────

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function fmtRelDate(date) {
  if (!date) return "—";
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtFullDate(date) {
  if (!date) return "—";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDuration(secs) {
  if (!secs) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function fmtCount(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function fmtBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + " " + units[i];
}

function escHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

function defaultAvatar() {
  return "https://tse1.mm.bing.net/th/id/OIP.cEvbluCvNFD_k4wC3k-_UwHaHa?rs=1&pid=ImgDetMain&o=7&rm=3";
}

console.log("✅ [video-posts] module loaded");
