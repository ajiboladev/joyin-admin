/* ============================================================
   JOYIN — Feedback Admin Panel Script
   Features:
     • Paginated loading (cursor-based, like home.js)
     • Filter by status / type
     • Client-side search
     • Reply saved to Firestore (NO EmailJS)
     • Delete with confirmation modal
   ============================================================ */

// ── Firebase imports ──────────────────────────────────────────
import { db, auth } from "../js/firebase.js";
import {
  collection,
  getDocs,
  getDoc,
  query,
  orderBy,
  where,
  updateDoc,
  deleteDoc,
  doc,
  limit,
  startAfter,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

// ── DOM references ────────────────────────────────────────────
const feedbackListEl = document.getElementById("adminFeedbackList");
const paginationFooter = document.getElementById("adminPaginationFooter");
const searchInput = document.getElementById("searchInput");
const filterBtns = document.querySelectorAll(".filter-btn");
const deleteModal = document.getElementById("deleteModal");
const cancelDeleteBtn = document.getElementById("cancelDeleteBtn");
const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");

// Stat elements
const statTotal = document.getElementById("statTotal");
const statNew = document.getElementById("statNew");
const statReplied = document.getElementById("statReplied");
const statToday = document.getElementById("statToday");

// ── Pagination config ─────────────────────────────────────────

/** How many feedback items to load per page */
const ADMIN_PER_PAGE = 10;

/**
 * Cursor for Firestore pagination.
 * Holds the last document from the previous batch so we can call
 * startAfter() to get the next batch — same pattern as home.js.
 */
let lastVisibleDoc = null;

/** Prevents triggering concurrent fetches */
let isLoadingDocs = false;

/** Set to false once we know no more documents exist */
let hasMoreDocs = true;

// ── Filter / search state ─────────────────────────────────────

/** The active filter tab: 'all' | 'new' | 'replied' | 'idea' | 'bug' | 'praise' */
let currentFilter = "all";

/** Lowercase search string typed by the user */
let searchTerm = "";

// ── Pending-delete state ──────────────────────────────────────

/**
 * When the user clicks Delete on a card, we store that card's
 * Firestore document ID here. The confirmation modal then uses it.
 */
let pendingDeleteId = null;

// ── Bootstrap ─────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  console.log("🛡️ Admin panel ready");
  setupFilterButtons();
  setupSearch();
  setupDeleteModal();
  loadAllStats(); // Fetch counts for the stats cards
  loadInitialItems(); // Load first page of feedback
});

// ── Stats ─────────────────────────────────────────────────────

/**
 * Fetches all feedback once (no limit) to calculate stats.
 * We keep this separate from the paginated list so stats are always accurate.
 */
async function loadAllStats() {
  try {
    const snapshot = await getDocs(
      query(collection(db, "feedback"), orderBy("createdAt", "desc")),
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let totalCount = 0;
    let newCount = 0;
    let repliedCount = 0;
    let todayCount = 0;

    snapshot.forEach((d) => {
      const data = d.data();
      totalCount++;
      if (data.status === "new") newCount++;
      if (data.status === "replied") repliedCount++;

      const feedbackDate = data.createdAt?.toDate
        ? data.createdAt.toDate()
        : new Date();
      if (feedbackDate >= today) todayCount++;
    });

    statTotal.textContent = totalCount;
    statNew.textContent = newCount;
    statReplied.textContent = repliedCount;
    statToday.textContent = todayCount;
  } catch (err) {
    console.error("Error loading stats:", err);
  }
}

// ── Paginated Feedback Loading ────────────────────────────────

/**
 * Resets state and loads the first page of feedback.
 * Called on page load, after filter changes, and after search clears/changes.
 */
async function resetAndLoad() {
  // Reset pagination variables to starting position
  lastVisibleDoc = null;
  isLoadingDocs = false;
  hasMoreDocs = true;

  // Clear the UI
  feedbackListEl.innerHTML = "";
  paginationFooter.innerHTML = "";

  await loadInitialItems();
}

/**
 * Loads the first ADMIN_PER_PAGE documents from Firestore
 * matching the current filter, newest first.
 */
async function loadInitialItems() {
  if (isLoadingDocs) return;
  isLoadingDocs = true;

  showListLoading();

  try {
    const q = buildQuery(null); // null = no cursor, start from the beginning
    const snapshot = await getDocs(q);

    feedbackListEl.innerHTML = "";

    if (snapshot.empty) {
      showListEmpty();
      hasMoreDocs = false;
      isLoadingDocs = false;
      return;
    }

    // Save cursor for next page
    lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1];

    // Render items (client-side search applied inside renderItem)
    renderBatch(snapshot.docs);

    // Decide pagination footer
    if (snapshot.size < ADMIN_PER_PAGE) {
      hasMoreDocs = false;
      showEndMessage();
    } else {
      hasMoreDocs = true;
      showLoadMoreButton();
    }
  } catch (err) {
    console.error("Error loading items:", err);
    showListError(err.message);
  }

  isLoadingDocs = false;
}

/**
 * Fetches the NEXT page of feedback using the saved cursor (startAfter).
 * Appends to the existing list — same pattern as loadMorePosts() in home.js.
 */
async function loadNextPage() {
  if (isLoadingDocs) return;
  if (!hasMoreDocs) return;
  if (!lastVisibleDoc) return;

  isLoadingDocs = true;

  // Disable "Load More" button while fetching
  const btn = document.getElementById("adminLoadMoreBtn");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading…';
  }

  try {
    // Build query starting AFTER the last doc we already loaded
    const q = buildQuery(lastVisibleDoc);
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      hasMoreDocs = false;
      showEndMessage();
      isLoadingDocs = false;
      return;
    }

    // Update cursor to the new last doc
    lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1];

    // Append new items
    renderBatch(snapshot.docs);

    if (snapshot.size < ADMIN_PER_PAGE) {
      hasMoreDocs = false;
      showEndMessage();
    } else {
      // Re-enable button for another page
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-chevron-down"></i> Load More';
      }
    }
  } catch (err) {
    console.error("Error loading next page:", err);
    showToast("Could not load more. Try again.", "error");
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-chevron-down"></i> Load More';
    }
  }

  isLoadingDocs = false;
}

/**
 * Builds a Firestore query based on the active filter.
 *
 * We apply a simple `where` clause for status/type filters so Firestore
 * handles it server-side. The text search is done client-side because
 * Firestore doesn't support full-text search natively.
 *
 * @param {QueryDocumentSnapshot|null} cursor  - startAfter cursor, or null
 * @returns {Query}
 */
function buildQuery(cursor) {
  let constraints = [collection(db, "feedback"), orderBy("createdAt", "desc")];

  // Apply server-side filter
  if (currentFilter === "new" || currentFilter === "replied") {
    constraints.push(where("status", "==", currentFilter));
  } else if (["idea", "bug", "praise", "other"].includes(currentFilter)) {
    constraints.push(where("type", "==", currentFilter));
  }

  // Add cursor if paginating
  if (cursor) {
    constraints.push(startAfter(cursor));
  }

  constraints.push(limit(ADMIN_PER_PAGE));

  return query(...constraints);
}

// ── Rendering ─────────────────────────────────────────────────

/**
 * Renders an array of Firestore QueryDocumentSnapshots.
 * Client-side search filter is applied here so users can search
 * within a page without needing a new Firestore query.
 *
 * @param {QueryDocumentSnapshot[]} docs
 */
function renderBatch(docs) {
  docs.forEach((docSnap) => {
    const data = docSnap.data();

    // ── Client-side search filter ──
    // If the user has typed something, only show matching items
    if (searchTerm) {
      const haystack = [
        data.message || "",
        data.userEmail || "",
        data.userName || "",
      ]
        .join(" ")
        .toLowerCase();

      if (!haystack.includes(searchTerm)) return; // skip this item
    }

    const el = buildAdminItemEl(docSnap.id, data);
    feedbackListEl.appendChild(el);
  });

  // If all items were filtered by search, show empty state
  if (!feedbackListEl.querySelector(".admin-item")) {
    if (feedbackListEl.innerHTML.trim() === "") {
      showListEmpty("No results match your search.");
    }
  }
}

/**
 * Builds the complete DOM element for one admin feedback card.
 *
 * @param {string} id    - Firestore document ID
 * @param {object} data  - Document fields
 * @returns {HTMLElement}
 */
function buildAdminItemEl(id, data) {
  const div = document.createElement("div");
  div.className = `admin-item status-${data.status || "new"}`;
  div.id = `admin-item-${id}`;

  // Dates
  const createdDate = data.createdAt?.toDate
    ? data.createdAt.toDate()
    : new Date();
  const dateStr = createdDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const repliedDate = data.repliedAt?.toDate
    ? data.repliedAt
        .toDate()
        .toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
    : null;

  // Type badge
  const typeMap = {
    idea: { emoji: "💡", label: "Idea" },
    bug: { emoji: "🐛", label: "Bug" },
    praise: { emoji: "❤️", label: "Praise" },
    other: { emoji: "📝", label: "Other" },
  };
  const typeInfo = typeMap[data.type] || { emoji: "📝", label: data.type };

  // Status badge colours
  const statusMap = {
    new: { cls: "info", icon: "fas fa-dot-circle", label: "New" },
    read: { cls: "warning", icon: "fas fa-eye", label: "Read" },
    replied: { cls: "success", icon: "fas fa-check", label: "Replied" },
    closed: { cls: "muted", icon: "fas fa-lock", label: "Closed" },
  };
  const statusInfo = statusMap[data.status] || statusMap["new"];

  // Avatar initial
  const initial = data.userName ? data.userName.charAt(0).toUpperCase() : "U";

  // Allow-reply notice
  const replyAllowed = data.allowReply !== false;

  div.innerHTML = `
        <!-- Header: user info + badges -->
        <div class="admin-item__header">
            <div class="admin-user">
                <div class="admin-user__avatar">${initial}</div>
                <div>
                    <div class="admin-user__name">${escapeHTML(data.userName || "Anonymous")}</div>
                    <div class="admin-user__email">${escapeHTML(data.userEmail || "")}</div>
                    <div class="admin-user__uid">${data.userId ? data.userId.substring(0, 12) + "…" : ""}</div>
                </div>
            </div>
            <div class="admin-item__badges">
                <span class="type-badge ${data.type}">${typeInfo.emoji} ${typeInfo.label}</span>
                <span class="status-pill ${statusInfo.cls === "success" ? "replied" : "pending"}">
                    <i class="${statusInfo.icon}"></i> ${statusInfo.label}
                </span>
                <span class="admin-item__date">${dateStr}</span>
            </div>
        </div>

        <!-- Message content -->
        <div class="admin-message-box">${escapeHTML(data.message)}</div>

        <!-- Reply-opt-out notice -->
        ${
          !replyAllowed
            ? `
            <div class="opted-out-notice">
                <i class="fas fa-envelope-slash"></i> User opted out of email replies
            </div>
        `
            : ""
        }

        <!-- Existing admin reply (if already replied) -->
        ${
          data.adminReply
            ? `
            <div class="existing-reply">
                <div class="existing-reply__label">
                    <i class="fas fa-reply"></i> Your Reply
                </div>
                <div class="existing-reply__text">${escapeHTML(data.adminReply)}</div>
                ${repliedDate ? `<div class="existing-reply__date">Sent on ${repliedDate}</div>` : ""}
            </div>
        `
            : ""
        }

        <!-- Action buttons -->
        <div class="admin-actions" style="margin-top:14px;">
            ${
              !data.adminReply
                ? `
                <button class="btn btn-reply" onclick="openReplyForm('${id}')">
                    <i class="fas fa-reply"></i> Reply
                </button>
            `
                : `
                <button class="btn btn-reply" onclick="openReplyForm('${id}')">
                    <i class="fas fa-edit"></i> Edit Reply
                </button>
            `
            }
            <button class="btn btn-delete" onclick="triggerDelete('${id}')">
                <i class="fas fa-trash-alt"></i> Delete
            </button>
        </div>

        <!-- Reply form (hidden until the Reply button is clicked) -->
        <div class="reply-form" id="reply-form-${id}">
            <textarea
                class="reply-textarea"
                id="reply-text-${id}"
                placeholder="Write your reply here. The user will see this when they check their feedback history."
                rows="4"
            >${data.adminReply ? escapeHTML(data.adminReply) : ""}</textarea>
            <div class="reply-form__actions">
                <button class="btn btn-cancel" onclick="closeReplyForm('${id}')">Cancel</button>
                <button class="btn btn-send" id="send-reply-btn-${id}" onclick="sendReply('${id}')">
                    <i class="fas fa-save"></i> Save Reply
                </button>
            </div>
        </div>
    `;

  return div;
}

// ── Reply ─────────────────────────────────────────────────────

/**
 * Shows the reply textarea for a feedback item.
 * Hides all other open reply forms first.
 *
 * @param {string} id - Firestore document ID
 */
window.openReplyForm = function (id) {
  // Close any other open forms
  document
    .querySelectorAll(".reply-form.open")
    .forEach((f) => f.classList.remove("open"));

  const form = document.getElementById(`reply-form-${id}`);
  if (form) {
    form.classList.add("open");
    document.getElementById(`reply-text-${id}`)?.focus();
  }
};

/**
 * Hides the reply form for a feedback item.
 *
 * @param {string} id - Firestore document ID
 */
window.closeReplyForm = function (id) {
  const form = document.getElementById(`reply-form-${id}`);
  if (form) form.classList.remove("open");
};

/**
 * Saves the admin reply to Firestore and updates the card in the DOM.
 * No email is sent — the reply is visible to the user in their history.
 *
 * @param {string} id - Firestore document ID
 */
window.sendReply = async function (id) {
  const textarea = document.getElementById(`reply-text-${id}`);
  const btn = document.getElementById(`send-reply-btn-${id}`);

  if (!textarea || !btn) return;

  const replyText = textarea.value.trim();

  if (!replyText) {
    showToast("Please write a reply before saving.", "error");
    textarea.focus();
    return;
  }

  // Disable button while saving
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…';

  try {
    const feedbackRef = doc(db, "feedback", id);

    // Update the document: set the reply and mark as replied
    await updateDoc(feedbackRef, {
      adminReply: replyText,
      status: "replied",
      repliedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    showToast("Reply saved successfully ✓", "success");

    // Refresh stats + reload the list so the card shows the reply
    loadAllStats();
    await resetAndLoad();
  } catch (err) {
    console.error("Error saving reply:", err);
    showToast(`Failed to save reply: ${err.message}`, "error");

    // Restore button
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> Save Reply';
  }
};

// ── Delete ────────────────────────────────────────────────────

/**
 * Stores the target document ID and opens the confirmation modal.
 * We never delete immediately — always ask first.
 *
 * @param {string} id - Firestore document ID
 */
window.triggerDelete = function (id) {
  pendingDeleteId = id;
  deleteModal.classList.remove("hidden");
};

/**
 * Confirms deletion: removes the document from Firestore,
 * then removes the card from the DOM.
 */
async function confirmDelete() {
  if (!pendingDeleteId) return;

  confirmDeleteBtn.disabled = true;
  confirmDeleteBtn.innerHTML =
    '<i class="fas fa-spinner fa-spin"></i> Deleting…';

  try {
    await deleteDoc(doc(db, "feedback", pendingDeleteId));

    // Remove the card from the DOM without reloading the whole list
    const card = document.getElementById(`admin-item-${pendingDeleteId}`);
    if (card) {
      card.style.transition = "opacity 0.3s, transform 0.3s";
      card.style.opacity = "0";
      card.style.transform = "scale(0.97)";
      setTimeout(() => card.remove(), 300);
    }

    showToast("Feedback deleted.", "success");

    // Refresh stats
    loadAllStats();
  } catch (err) {
    console.error("Error deleting feedback:", err);
    showToast(`Delete failed: ${err.message}`, "error");
  }

  // Reset modal state
  confirmDeleteBtn.disabled = false;
  confirmDeleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i> Delete';
  pendingDeleteId = null;
  deleteModal.classList.add("hidden");
}

// ── Delete Modal Setup ────────────────────────────────────────

function setupDeleteModal() {
  // Cancel closes without doing anything
  cancelDeleteBtn.addEventListener("click", () => {
    pendingDeleteId = null;
    deleteModal.classList.add("hidden");
  });

  // Confirm executes the delete
  confirmDeleteBtn.addEventListener("click", confirmDelete);

  // Clicking the dark overlay also cancels
  deleteModal.addEventListener("click", (e) => {
    if (e.target === deleteModal) {
      pendingDeleteId = null;
      deleteModal.classList.add("hidden");
    }
  });
}

// ── Filter Buttons ────────────────────────────────────────────

function setupFilterButtons() {
  filterBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      // Update active state
      filterBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      // Store new filter and reload from the beginning
      currentFilter = btn.dataset.filter;
      resetAndLoad();
    });
  });
}

// ── Search ────────────────────────────────────────────────────

/**
 * Debounced search input handler.
 * We wait 350ms after the user stops typing before running the search
 * to avoid unnecessary Firestore reads.
 */
let searchDebounceTimer = null;

function setupSearch() {
  searchInput.addEventListener("input", (e) => {
    clearTimeout(searchDebounceTimer);

    searchDebounceTimer = setTimeout(() => {
      searchTerm = e.target.value.toLowerCase().trim();
      // Reload from the beginning so the filter applies to all pages
      resetAndLoad();
    }, 350);
  });
}

// ── Pagination UI ─────────────────────────────────────────────

function showLoadMoreButton() {
  paginationFooter.innerHTML = `
        <button id="adminLoadMoreBtn" class="load-more-btn">
            <i class="fas fa-chevron-down"></i> Load More
        </button>
    `;
  document
    .getElementById("adminLoadMoreBtn")
    .addEventListener("click", loadNextPage);
}

function showEndMessage() {
  paginationFooter.innerHTML = `
        <p class="end-message">All feedback loaded</p>
    `;
}

// ── List State Helpers ────────────────────────────────────────

function showListLoading() {
  feedbackListEl.innerHTML = `
        <div class="state-msg">
            <div class="spinner"></div>
            <p>Loading feedback…</p>
        </div>
    `;
}

function showListEmpty(msg = "No feedback found for this filter.") {
  feedbackListEl.innerHTML = `
        <div class="state-msg">
            <i class="fas fa-inbox"></i>
            <p>${msg}</p>
        </div>
    `;
  paginationFooter.innerHTML = "";
}

function showListError(msg = "") {
  feedbackListEl.innerHTML = `
        <div class="state-msg">
            <i class="fas fa-exclamation-triangle"></i>
            <p>Error loading feedback${msg ? ": " + msg : ""}.<br>
               <button onclick="location.reload()" style="margin-top:10px;padding:8px 18px;background:var(--accent);color:#fff;border:none;border-radius:999px;cursor:pointer;font-size:0.82rem;">Retry</button>
            </p>
        </div>
    `;
}

// ── Toast ─────────────────────────────────────────────────────

let toastTimer = null;

/**
 * Shows a brief toast notification at the bottom of the screen.
 *
 * @param {string} msg
 * @param {'success'|'error'|'info'} type
 */
function showToast(msg, type = "info") {
  const toast = document.getElementById("toast");
  if (!toast) return;

  clearTimeout(toastTimer);
  toast.className = `toast ${type}`;
  toast.textContent = msg;

  requestAnimationFrame(() => toast.classList.add("show"));

  toastTimer = setTimeout(() => toast.classList.remove("show"), 3500);
}

// ── Utility ───────────────────────────────────────────────────

/**
 * Escapes HTML to prevent XSS when rendering user-generated content.
 */
function escapeHTML(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
