import { adminLogout, checkAdminAuth } from "../js/auth.js";
import { db } from "../js/firebase.js";
import {
  setupSidebar,
  setButtonLoading,
  showConfirm,
  showToast,
} from "../js/ui.js";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const admin = await checkAdminAuth();
if (!admin) window.location.href = "../index.html";

document.getElementById("logoutBtn").addEventListener("click", adminLogout);
setupSidebar();

const PAGE_SIZE = 10;
const CATEGORY_ALIASES = {
  ideas: ["ideas", "idea"],
  bug: ["bug"],
  praise: ["praise"],
  others: ["others", "other"],
  other: ["others", "other"],
};

const list = document.getElementById("feedbackList");
const loadMoreWrap = document.getElementById("loadMoreWrap");
const loadMoreButton = document.getElementById("loadMoreBtn");
const categoryButtons = [...document.querySelectorAll(".category-btn")];

let currentCategory = "ideas";
let lastVisibleDoc = null;
let hasMore = false;
let loading = false;

function normalizeCategory(value) {
  const clean = (value || "").toLowerCase().trim();
  if (clean === "other" || clean === "others") return "others";
  if (clean === "idea") return "ideas";
  return clean || "ideas";
}

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function escapeHtml(value = "") {
  const node = document.createElement("div");
  node.textContent = String(value);
  return node.innerHTML;
}

function getReplyLabel(item) {
  const replyValue =
    item.reply === true || item.replied === true || Boolean(item.adminReply);
  return replyValue ? "Replied" : "Not replied";
}

function buildCategoryQuery(category, cursor = null) {
  const values = CATEGORY_ALIASES[normalizeCategory(category)] || [
    normalizeCategory(category),
  ];
  const constraints = [orderBy("timestamp", "desc"), limit(PAGE_SIZE)];
  if (cursor) constraints.splice(1, 0, startAfter(cursor));

  return query(
    collection(db, "feedback"),
    where("category", "in", values),
    ...constraints,
  );
}

async function fetchFeedback(category, cursor = null) {
  const normalized = normalizeCategory(category);
  const values = CATEGORY_ALIASES[normalized] || [normalized];

  try {
    const q = query(
      collection(db, "feedback"),
      where("category", "in", values),
      orderBy("timestamp", "desc"),
      ...(cursor ? [startAfter(cursor)] : []),
      limit(PAGE_SIZE),
    );
    const snapshot = await getDocs(q);
    if (!snapshot.empty || cursor) return snapshot;
  } catch (error) {
    console.warn("category query fallback", error.message);
  }

  try {
    const q = query(
      collection(db, "feedback"),
      where("type", "in", values),
      orderBy("timestamp", "desc"),
      ...(cursor ? [startAfter(cursor)] : []),
      limit(PAGE_SIZE),
    );
    const snapshot = await getDocs(q);
    if (!snapshot.empty || cursor) return snapshot;
  } catch (error) {
    console.warn("type query fallback", error.message);
  }

  try {
    const q = query(
      collection(db, "feedback", normalized),
      orderBy("timestamp", "desc"),
      ...(cursor ? [startAfter(cursor)] : []),
      limit(PAGE_SIZE),
    );
    const snapshot = await getDocs(q);
    if (!snapshot.empty || cursor) return snapshot;
  } catch (error) {
    console.warn("subcollection query fallback", error.message);
  }

  const fallbackQuery = query(
    collection(db, "feedback"),
    orderBy("timestamp", "desc"),
    ...(cursor ? [startAfter(cursor)] : []),
    limit(PAGE_SIZE),
  );
  const snapshot = await getDocs(fallbackQuery);
  const docs = snapshot.docs.filter((docSnap) => {
    const data = docSnap.data();
    const categoryValue = (data.category || data.type || "").toLowerCase();
    return (
      values.includes(categoryValue) ||
      values.includes((categoryValue || "").replace(/s$/, ""))
    );
  });
  return {
    docs,
    empty: docs.length === 0,
    size: docs.length,
    forEach: (cb) => docs.forEach(cb),
  };
}

function renderFeedback(items, append = false) {
  if (!items.length && !append) {
    list.innerHTML =
      '<div class="card empty-state"><i class="fas fa-inbox" style="font-size:1.5rem;display:block;margin-bottom:10px"></i>No feedback available in this category.</div>';
    return;
  }

  const markup = items
    .map((item) => {
      const ts = toDate(item.timestamp || item.createdAt || item.date);
      const dateText = ts ? ts.toLocaleString() : "Unknown time";
      const userId = item.userId || item.uid || "Unknown user";
      const email = item.email || item.userEmail || "No email";
      const text = item.text || item.message || item.feedback || "No message";
      const replyLabel = getReplyLabel(item);
      const categoryLabel = item.category || item.type || currentCategory;
      const normalizedCategory = normalizeCategory(categoryLabel);
      const categoryBtnText =
        normalizedCategory === "others"
          ? "Others"
          : normalizedCategory.charAt(0).toUpperCase() +
            normalizedCategory.slice(1);

      return `
      <article class="feedback-card" data-id="${escapeHtml(item.id)}" data-path="${escapeHtml(item.docPath || "")}">
        <div class="feedback-head">
          <div class="feedback-meta">
            <span class="feedback-badge"><i class="fas fa-tag"></i> ${escapeHtml(categoryBtnText)}</span>
            <span class="status-pill ${replyLabel === "Replied" ? "replied" : "pending"}"><i class="fas ${replyLabel === "Replied" ? "fa-check" : "fa-clock"}"></i> ${replyLabel}</span>
          </div>
          <div class="feedback-meta"><i class="fas fa-clock"></i> ${escapeHtml(dateText)}</div>
        </div>

        <div class="feedback-user-row">
          <span><strong>User ID:</strong> ${escapeHtml(userId)}</span>
          <button class="btn btn-icon copy-btn" data-copy="userId" data-copy-value="${escapeHtml(userId)}" title="Copy user ID"><i class="fas fa-copy"></i></button>
        </div>

        <div class="feedback-email-row">
          <span><strong>Email:</strong> ${escapeHtml(email)}</span>
          <button class="btn btn-icon copy-btn" data-copy="email" data-copy-value="${escapeHtml(email)}" title="Copy email"><i class="fas fa-copy"></i></button>
        </div>

        <div class="feedback-text">${escapeHtml(text)}</div>

        <div class="feedback-actions">
          <button class="btn btn-icon btn-danger" data-delete="${escapeHtml(item.id)}" data-doc-path="${escapeHtml(item.docPath || "")}" title="Delete feedback"><i class="fas fa-trash"></i></button>
        </div>
      </article>
    `;
    })
    .join("");

  if (append) list.insertAdjacentHTML("beforeend", markup);
  else list.innerHTML = markup;
}

async function loadFeedback(append = false) {
  if (loading) return;
  loading = true;
  const targetButton = append
    ? loadMoreButton
    : document.querySelector(".category-btn.active") || loadMoreButton;
  const restore = setButtonLoading(targetButton, "Loading...");
  try {
    const snapshot = await fetchFeedback(
      currentCategory,
      append ? lastVisibleDoc : null,
    );
    const docs = snapshot.docs
      ? snapshot.docs
      : Array.from(snapshot).map(([_, value]) => value);
    const items = docs.map((docSnap) => {
      const data = docSnap.data();
      const docPath = docSnap.ref.path;
      return { id: docSnap.id, docPath, ...data };
    });

    if (!append) {
      lastVisibleDoc = null;
      list.innerHTML = "";
    }

    renderFeedback(items, append);
    lastVisibleDoc =
      snapshot.docs && snapshot.docs.length
        ? snapshot.docs[snapshot.docs.length - 1]
        : null;
    hasMore = Boolean(snapshot.docs && snapshot.docs.length === PAGE_SIZE);
    loadMoreWrap.style.display = hasMore ? "block" : "none";

    if (!items.length) {
      list.innerHTML =
        '<div class="card empty-state"><i class="fas fa-inbox" style="font-size:1.5rem;display:block;margin-bottom:10px"></i>No feedback found in this category.</div>';
      loadMoreWrap.style.display = "none";
    }
  } catch (error) {
    list.innerHTML = `<div class="card empty-state" style="color:#f87171">Could not load feedback: ${escapeHtml(error.message)}</div>`;
    showToast(`Feedback loading failed: ${error.message}`, "error");
  } finally {
    loading = false;
    restore();
  }
}

async function deleteFeedbackItem(itemId, itemPath) {
  if (!itemId) throw new Error("Missing feedback ID.");
  const ref = itemPath
    ? doc(db, ...itemPath.split("/"))
    : doc(db, "feedback", itemId);
  await deleteDoc(ref);
}

categoryButtons.forEach((button) => {
  button.addEventListener("click", () => {
    categoryButtons.forEach((btn) =>
      btn.classList.toggle("active", btn === button),
    );
    currentCategory = button.dataset.category;
    lastVisibleDoc = null;
    loadFeedback(false);
  });
});

loadMoreButton.addEventListener("click", async () => {
  if (loading || !lastVisibleDoc) return;
  await loadFeedback(true);
});

list.addEventListener("click", async (event) => {
  const copyButton = event.target.closest("[data-copy]");
  if (copyButton) {
    const value = copyButton.dataset.copyValue || "";
    try {
      await navigator.clipboard.writeText(value);
      showToast(
        `${copyButton.dataset.copy === "email" ? "Email" : "User ID"} copied.`,
        "success",
      );
    } catch {
      showToast("Copy failed.", "error");
    }
    return;
  }

  const deleteButton = event.target.closest("[data-delete]");
  if (!deleteButton) return;

  const confirmed = await showConfirm({
    title: "Delete this feedback?",
    message: "This permanently removes this feedback item from Firestore.",
    confirmText: "Delete item",
    intent: "danger",
  });
  if (!confirmed) return;

  const restore = setButtonLoading(deleteButton, "Deleting...");
  try {
    const docPath = deleteButton.dataset.docPath || "";
    await deleteFeedbackItem(deleteButton.dataset.delete, docPath);
    deleteButton.closest(".feedback-card")?.remove();
    showToast("Feedback item deleted.", "success");
    if (!list.querySelector(".feedback-card")) {
      list.innerHTML =
        '<div class="card empty-state">No feedback on this page.</div>';
    }
  } catch (error) {
    showToast(`Could not delete feedback: ${error.message}`, "error");
  } finally {
    restore();
  }
});

loadFeedback(false);
