import {
  CONTENT_SUBCOLLECTIONS,
  deleteContentBatch,
  finalizeContentDeletion,
  findPost,
  inspectDeletion,
} from "./content-tools.js";
import { db } from "./firebase.js";
import {
  deleteField,
  doc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import {
  deleteCloudinaryImage,
  deleteCloudinaryVideo,
} from "./deleteCloudinary.js";

const esc = (value = "") => {
  const node = document.createElement("div");
  node.textContent = value;
  return node.innerHTML;
};

function collectionName(type) {
  return type === "video" ? "video-posts" : "posts";
}

async function removeAsset(publicId, type, thumbnail = false) {
  if (!publicId) return;
  const remove = type === "video" && !thumbnail
    ? deleteCloudinaryVideo
    : deleteCloudinaryImage;
  try {
    await remove(publicId);
  } catch (error) {
    if (!/not found|not_found/i.test(error.message)) throw error;
  }
}

async function deleteMediaField(post, type) {
  const updates = {};
  if (type === "video") {
    await removeAsset(post.cloudinaryId, type);
    await removeAsset(post.thumbnailCloudinaryId, type, true);
    updates.cloudinaryId = deleteField();
    updates.thumbnailCloudinaryId = deleteField();
  } else {
    await removeAsset(post.cloudinaryId, type);
    updates.cloudinaryId = deleteField();
  }
  if (post.imageUrl) updates.imageUrl = deleteField();
  if (post.thumbnailUrl) updates.thumbnailUrl = deleteField();
  await updateDoc(doc(db, collectionName(type), post.id), updates);
}

async function deleteCaption(post, type) {
  const updates = { text: deleteField() };
  if (post.caption) updates.caption = deleteField();
  await updateDoc(doc(db, collectionName(type), post.id), updates);
}

export async function openContentDeletionModal({ id, type, onDeleted } = {}) {
  let post = null;

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay open";
  overlay.innerHTML = `
    <div class="modal content-delete-modal" style="max-width:720px;max-height:90vh;overflow:auto;">
      <div class="modal-header">
        <span class="modal-title"><i class="fas fa-shield-halved"></i> Controlled deletion</span>
        <button type="button" class="close-modal" data-close>×</button>
      </div>
      <div class="modal-body" data-body></div>
    </div>`;
  document.body.appendChild(overlay);
  const body = overlay.querySelector("[data-body]");

  const close = () => overlay.remove();
  overlay.querySelector("[data-close]").addEventListener("click", close);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });

  const render = (message = "") => {
    const isVideo = type === "video";
    const mediaUrl = isVideo ? post.thumbnailUrl : post.imageUrl;
    const hasMedia = Boolean(
      isVideo ? post.videoUrl || post.thumbnailUrl || post.cloudinaryId : post.imageUrl || post.cloudinaryId,
    );
    body.innerHTML = `
      <div style="padding:4px 0 16px;color:var(--text-2);font-size:.85rem;">Deleting from <strong>${collectionName(type)}</strong>/${esc(post.id)}</div>
      <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-md);padding:16px;margin-bottom:16px;">
        <div style="font-size:.95rem;line-height:1.5;white-space:pre-wrap;">${esc(post.text || post.caption || "No text")}</div>
        ${isVideo && post.videoUrl ? `<video controls playsinline preload="metadata" poster="${esc(mediaUrl || "")}" src="${esc(post.videoUrl)}" style="display:block;max-width:100%;max-height:300px;margin:14px auto 0;"></video>` : mediaUrl ? `<img src="${esc(mediaUrl)}" alt="Content media" style="display:block;max-width:100%;max-height:300px;width:auto;height:auto;margin:14px auto 0;object-fit:contain;">` : ""}
        <div style="display:flex;flex-wrap:wrap;gap:14px;margin-top:14px;color:var(--text-2);font-size:.8rem;">
          <span><i class="fas fa-heart"></i> ${post.likesCount || 0} likes</span><span><i class="fas fa-comment"></i> ${post.commentsCount || 0} comments</span><span><i class="fas fa-eye"></i> ${post.viewsCount || 0} views</span>
        </div>
      </div>
      <div data-message style="min-height:22px;color:var(--text-2);font-size:.82rem;margin-bottom:10px;">${esc(message)}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;">
        ${post.text || post.caption ? `<button class="btn" data-action="caption"><i class="fas fa-font"></i> Delete text</button>` : ""}
        ${hasMedia ? `<button class="btn" data-action="media"><i class="fas fa-image"></i> Delete ${isVideo ? "video & thumbnail" : "image"}</button>` : ""}
        ${CONTENT_SUBCOLLECTIONS.map((name) => `<button class="btn" data-action="${name}"><i class="fas fa-${name === "comments" ? "comment" : name === "likes" ? "heart" : "eye"}"></i> Delete ${name}</button>`).join("")}
        <button class="btn btn-danger" data-action="parent"><i class="fas fa-trash"></i> Delete ${isVideo ? "video post" : "post"}</button>
      </div>`;

    body.querySelectorAll("[data-action]").forEach((button) => {
      button.addEventListener("click", async () => {
        const action = button.dataset.action;
        button.disabled = true;
        const original = button.innerHTML;
        button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Working...`;
        const messageNode = body.querySelector("[data-message]");
        try {
          if (action === "parent") {
            const result = await finalizeContentDeletion(post.id, type);
            if (!result.deleted) {
              render(result.message);
              return;
            }
            messageNode.textContent = result.message;
            if (onDeleted) await onDeleted();
            setTimeout(close, 500);
            return;
          }
          if (action === "caption") {
            await deleteCaption(post, type);
            messageNode.textContent = "Text deleted successfully.";
          } else if (action === "media") {
            await deleteMediaField(post, type);
            messageNode.textContent = "Media cleanup completed and its Firestore fields were removed.";
          } else {
            const result = await deleteContentBatch(post.id, type, action);
            messageNode.textContent = result.deleted
              ? `${result.deleted} ${action} deleted. Click again to continue if more remain.`
              : `${action} collection is empty; its counter document was removed.`;
          }
          post = await findPost(post.id, type);
          if (!post) return close();
          render(messageNode.textContent);
        } catch (error) {
          messageNode.textContent = `Failed: ${error.message}`;
          button.disabled = false;
          button.innerHTML = original;
        }
      });
    });
  };

  body.innerHTML = `
    <div style="min-height:180px;display:flex;align-items:center;justify-content:center;gap:10px;color:var(--text-2);">
      <i class="fas fa-spinner fa-spin"></i> Loading content details...
    </div>`;

  findPost(id, type)
    .then((foundPost) => {
      post = foundPost;
      if (!post) {
        body.innerHTML = `<div style="padding:36px 12px;text-align:center;color:var(--text-2);">Content not found.</div>`;
        return;
      }
      render();
    })
    .catch((error) => {
      body.innerHTML = `<div style="padding:36px 12px;text-align:center;color:#f87171;">Could not load content: ${esc(error.message)}</div>`;
    });
}
