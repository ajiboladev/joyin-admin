import { adminLogout, checkAdminAuth } from "./auth.js";
import {
  setupSidebar,
  setButtonLoading,
  showConfirm,
  showToast,
  skeletonRows,
} from "./ui.js";
import {
  deleteDeleteRequest,
  fetchDeleteRequests,
  restoreAccountDeletionRequest,
} from "./delete-requests.js";

const admin = await checkAdminAuth();
if (!admin) window.location.href = "index.html";

document.getElementById("logoutBtn").addEventListener("click", adminLogout);
setupSidebar();

const root = document.documentElement;
const collectionName = root.dataset.requestCollection;
const title = root.dataset.requestTitle;
const timestampField = root.dataset.timestampField || "timestamp";
const accountMode = root.dataset.requestKind === "account";
const list = document.getElementById("requestList");
const fetchButton = document.getElementById("fetchBtn");
const loadMoreWrap = document.getElementById("loadMoreWrap");
const loadMoreButton = document.getElementById("loadMoreBtn");
let cursor = null;
let hasMore = false;
let loaded = false;
let loading = false;
let olderThan = null;

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function escapeHtml(value = "") {
  const node = document.createElement("div");
  node.textContent = value;
  return node.innerHTML;
}

function requestLink(request) {
  return (
    request.link || request.url || request.postLink || request.videoLink || ""
  );
}

function requestIdFromLink(link) {
  if (!link) return "";
  try {
    const parts = new URL(link).pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] || "";
  } catch {
    return link.split("/").filter(Boolean).pop() || "";
  }
}

function renderRequests(requests, append = false) {
  if (!requests.length && !append) {
    list.innerHTML = `<div class="card empty-state"><i class="fas fa-inbox" style="font-size:1.6rem;display:block;margin-bottom:10px"></i>No ${escapeHtml(title)} records found.</div>`;
    return;
  }

  const markup = requests
    .map((request) => {
      const date = toDate(request[timestampField]);
      const link = requestLink(request);
      const contentId = requestIdFromLink(link);
      if (accountMode) {
        return `<article class="request-row" data-request-id="${escapeHtml(request.id)}" data-uid="${escapeHtml(request.uid || "")}">
        <div><div class="request-meta"><span><i class="fas fa-user"></i>${escapeHtml(request.uid || "Unknown user")}</span><span><i class="fas fa-envelope"></i>${escapeHtml(request.email || "No email")}</span><span><i class="fas fa-clock"></i>${date ? date.toLocaleString() : "Unknown time"}</span></div><div class="muted" style="font-size:.78rem">Request ID: ${escapeHtml(request.id)}</div></div>
        <div class="request-actions">
          <button class="btn btn-icon btn-success" data-restore="${escapeHtml(request.id)}" data-uid="${escapeHtml(request.uid || "")}" title="Restore account and cancel deletion"><i class="fas fa-user-check"></i></button>
          <button class="btn btn-icon btn-danger" data-delete="${escapeHtml(request.id)}" title="Delete request"><i class="fas fa-trash"></i></button>
        </div>
      </article>`;
      }
      return `<article class="request-row" data-request-id="${escapeHtml(request.id)}">
      <div>
        <div class="request-meta"><span><i class="fas fa-user"></i>${escapeHtml(request.userId || "Unknown user")}</span><span><i class="fas fa-clock"></i>${date ? date.toLocaleString() : "Unknown time"}</span></div>
        <a class="request-link" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link || "No link provided")}</a>
        ${contentId ? `<div class="request-meta" style="margin-top:8px;margin-bottom:0"><span><i class="fas fa-hashtag"></i>${escapeHtml(contentId)}</span><button class="btn btn-icon" data-copy-id="${escapeHtml(contentId)}" title="Copy ID"><i class="fas fa-copy"></i></button></div>` : ""}
      </div>
      <div class="request-actions">
        ${link ? `<button class="btn btn-icon" data-copy="${escapeHtml(link)}" title="Copy link"><i class="fas fa-copy"></i></button>` : ""}
        <button class="btn btn-icon btn-danger" data-delete="${escapeHtml(request.id)}" title="Delete request"><i class="fas fa-trash"></i></button>
      </div>
    </article>`;
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
    append ? "Loading..." : "Fetching...",
  );
  if (!append) list.innerHTML = skeletonRows(3, 6);
  try {
    const result = await fetchDeleteRequests(
      collectionName,
      append ? cursor : null,
      timestampField,
      olderThan,
    );
    renderRequests(result.requests, append);
    cursor = result.nextCursor;
    hasMore = result.hasMore;
    loaded = true;
    loadMoreWrap.style.display = hasMore ? "block" : "none";
  } catch (error) {
    if (!append)
      list.innerHTML = `<div class="card empty-state" style="color:#f87171">Could not load requests: ${escapeHtml(error.message)}</div>`;
    showToast(`Request loading failed: ${error.message}`, "error");
  } finally {
    loading = false;
    restore();
  }
}

fetchButton.addEventListener("click", () => loadRequests(false));
loadMoreButton.addEventListener("click", () => loadRequests(true));

if (accountMode) {
  const filterSelect = document.getElementById("ageFilter");
  const customDate = document.getElementById("customDate");
  const clearFilter = document.getElementById("clearFilter");

  function applyAgeFilter(value) {
    const cutoff = new Date();
    if (value === "30") cutoff.setDate(cutoff.getDate() - 30);
    else if (value === "90") cutoff.setDate(cutoff.getDate() - 90);
    else if (value === "180") cutoff.setDate(cutoff.getDate() - 180);
    else if (value === "365") cutoff.setDate(cutoff.getDate() - 365);
    else if (value === "custom" && customDate.value) {
      olderThan = new Date(`${customDate.value}T23:59:59`);
    } else {
      olderThan = null;
      return;
    }
    if (value !== "custom") olderThan = cutoff;
    cursor = null;
    loadRequests(false);
  }

  filterSelect.addEventListener("change", () => {
    customDate.style.display =
      filterSelect.value === "custom" ? "block" : "none";
    if (filterSelect.value !== "custom") applyAgeFilter(filterSelect.value);
  });
  customDate.addEventListener("change", () => applyAgeFilter("custom"));
  clearFilter.addEventListener("click", () => {
    filterSelect.value = "";
    customDate.value = "";
    customDate.style.display = "none";
    olderThan = null;
    cursor = null;
    loadRequests(false);
  });
}

list.addEventListener("click", async (event) => {
  const copyButton = event.target.closest("[data-copy]");
  if (copyButton) {
    try {
      await navigator.clipboard.writeText(copyButton.dataset.copy);
      showToast("Link copied.", "success");
    } catch {
      showToast("Could not copy the link.", "error");
    }
    return;
  }

  const copyIdButton = event.target.closest("[data-copy-id]");
  if (copyIdButton) {
    try {
      await navigator.clipboard.writeText(copyIdButton.dataset.copyId);
      showToast("ID copied.", "success");
    } catch {
      showToast("Could not copy the ID.", "error");
    }
    return;
  }

  const restoreButton = event.target.closest("[data-restore]");
  if (restoreButton) {
    const uid = restoreButton.dataset.uid;
    const requestId = restoreButton.dataset.restore;
    if (!uid) {
      showToast(
        "This request does not include a user ID, so it cannot be restored.",
        "error",
      );
      return;
    }

    const confirmed = await showConfirm({
      title: "Restore account from deletion?",
      message: `This will restore the account data for UID ${uid} and remove the pending deletion request from ${collectionName}.`,
      confirmText: "Restore account",
      intent: "warning",
    });
    if (!confirmed) return;

    const restore = setButtonLoading(restoreButton, "Restoring...");
    try {
      await restoreAccountDeletionRequest(collectionName, requestId, uid);
      restoreButton.closest(".request-row")?.remove();
      showToast(
        "Account restoration completed and the request was removed.",
        "success",
      );
      if (!list.querySelector(".request-row") && loaded) {
        list.innerHTML = `<div class="card empty-state">No requests on this page.</div>`;
      }
    } catch (error) {
      showToast(`Could not restore account: ${error.message}`, "error");
    } finally {
      restore();
    }
    return;
  }

  const deleteButton = event.target.closest("[data-delete]");
  if (!deleteButton) return;
  const confirmed = await showConfirm({
    title: "Delete this request?",
    message:
      "This removes only the deletion request record. The referenced content is not deleted.",
    confirmText: "Confirm & Delete",
    intent: "danger",
  });
  if (!confirmed) return;
  const restore = setButtonLoading(deleteButton, "Deleting...");
  try {
    await deleteDeleteRequest(collectionName, deleteButton.dataset.delete);
    deleteButton.closest(".request-row")?.remove();
    showToast("Deletion request removed.", "success");
    if (!list.querySelector(".request-row") && loaded) {
      list.innerHTML = `<div class="card empty-state">No requests on this page.</div>`;
    }
  } catch (error) {
    showToast(`Could not delete request: ${error.message}`, "error");
    restore();
  }
});
