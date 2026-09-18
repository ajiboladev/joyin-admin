import { adminLogout, checkAdminAuth } from "./auth.js";
import { db } from "./firebase.js";
import {
  setupSidebar,
  setButtonLoading,
  showConfirm,
  showToast,
} from "./ui.js";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const admin = await checkAdminAuth();
if (!admin) window.location.href = "index.html";

document.getElementById("logoutBtn").addEventListener("click", adminLogout);
setupSidebar();

const collectionName = "support-request";
const PAGE_SIZE = 10;
const list = document.getElementById("requestList");
const fetchButton = document.getElementById("fetchBtn");
const loadMoreWrap = document.getElementById("loadMoreWrap");
const loadMoreButton = document.getElementById("loadMoreBtn");

let cursor = null;
let loading = false;
let loaded = false;
let hasMore = false;

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

async function fetchSupportRequests(nextCursor = null) {
  const constraints = [orderBy("createdAt", "desc"), limit(PAGE_SIZE)];
  if (nextCursor) constraints.splice(1, 0, startAfter(nextCursor));

  const snapshot = await getDocs(
    query(collection(db, collectionName), ...constraints),
  );
  return {
    requests: snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    })),
    nextCursor: snapshot.empty
      ? nextCursor
      : snapshot.docs[snapshot.docs.length - 1],
    hasMore: snapshot.size === PAGE_SIZE,
  };
}

function issueClass(issue = "") {
  const value = String(issue || "").toLowerCase();
  if (value.includes("bug")) return "bug";
  if (value.includes("account")) return "account";
  if (value.includes("payment")) return "payment";
  if (value.includes("security")) return "security";
  return "other";
}

function renderRequests(requests, append = false) {
  if (!requests.length && !append) {
    list.innerHTML =
      '<div class="card empty-state"><i class="fas fa-headset" style="font-size:1.5rem;display:block;margin-bottom:10px"></i>No support requests found.</div>';
    return;
  }

  const markup = requests
    .map((request) => {
      const createdAt = toDate(request.createdAt);
      const issue = request.issue || "Other";
      const fullText =
        request.text || request.description || "No description provided.";
      const name = request.name || "Unknown user";
      const email = request.email || "No email";
      const uid = request.uid || "Unknown UID";

      return `
        <article class="support-card" data-id="${escapeHtml(request.id)}">
          <div class="support-head">
            <div class="support-badges">
              <span class="issue-pill ${issueClass(issue)}">${escapeHtml(issue)}</span>
              <span class="muted" style="font-size:.76rem"><i class="fas fa-clock"></i> ${escapeHtml(createdAt ? createdAt.toLocaleString() : "Unknown time")}</span>
            </div>
            <button class="btn btn-icon btn-danger" data-delete="${escapeHtml(request.id)}" title="Delete request"><i class="fas fa-trash"></i></button>
          </div>

          <div class="support-meta-row">
            <span><strong>Name:</strong> ${escapeHtml(name)}</span>
          </div>

          <div class="support-meta-row">
            <span><strong>Email:</strong> ${escapeHtml(email)}</span>
            <button class="btn btn-icon copy-btn" data-copy="email" data-copy-value="${escapeHtml(email)}" title="Copy email"><i class="fas fa-copy"></i></button>
          </div>

          <div class="support-meta-row">
            <span><strong>UID:</strong> ${escapeHtml(uid)}</span>
            <button class="btn btn-icon copy-btn" data-copy="uid" data-copy-value="${escapeHtml(uid)}" title="Copy UID"><i class="fas fa-copy"></i></button>
          </div>

          <div class="support-issue-box">
            <strong>Issue</strong>
            <div>${escapeHtml(issue)}</div>
          </div>

          <div class="support-text-box">
            <strong>Details</strong>
            <p>${escapeHtml(fullText)}</p>
          </div>
        </article>
      `;
    })
    .join("");

  if (append) list.insertAdjacentHTML("beforeend", markup);
  else list.innerHTML = markup;
}

async function loadRequests(append = false) {
  if (loading) return;
  loading = true;

  const restore = setButtonLoading(
    append ? loadMoreButton : fetchButton,
    "Loading...",
  );
  try {
    const result = await fetchSupportRequests(append ? cursor : null);
    renderRequests(result.requests, append);
    cursor = result.nextCursor;
    hasMore = result.hasMore;
    loaded = true;
    loadMoreWrap.style.display = hasMore ? "block" : "none";
  } catch (error) {
    list.innerHTML = `<div class="card empty-state" style="color:#f87171">Could not load support requests: ${escapeHtml(error.message)}</div>`;
    showToast(`Support request load failed: ${error.message}`, "error");
  } finally {
    loading = false;
    restore();
  }
}

async function deleteRequest(id) {
  if (!id) throw new Error("Missing request ID.");
  await deleteDoc(doc(db, collectionName, id));
}

fetchButton.addEventListener("click", () => {
  cursor = null;
  loadRequests(false);
});

loadMoreButton.addEventListener("click", () => {
  if (!cursor || loading) return;
  loadRequests(true);
});

list.addEventListener("click", async (event) => {
  const copyButton = event.target.closest("[data-copy]");
  if (copyButton) {
    const value = copyButton.dataset.copyValue || "";
    try {
      await navigator.clipboard.writeText(value);
      showToast(
        `${copyButton.dataset.copy === "email" ? "Email" : "UID"} copied.`,
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
    title: "Delete support request?",
    message:
      "This will permanently remove this support request from Firestore.",
    confirmText: "Delete request",
    intent: "danger",
  });
  if (!confirmed) return;

  const restore = setButtonLoading(deleteButton, "Deleting...");
  try {
    await deleteRequest(deleteButton.dataset.delete);
    deleteButton.closest(".support-card")?.remove();
    showToast("Support request deleted.", "success");
    if (!list.querySelector(".support-card") && loaded) {
      list.innerHTML =
        '<div class="card empty-state">No support requests on this page.</div>';
    }
  } catch (error) {
    showToast(`Could not delete request: ${error.message}`, "error");
  } finally {
    restore();
  }
});

loadRequests(false);
