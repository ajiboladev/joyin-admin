// admin/js/posts.js
import { auth, db, storage } from "./firebase.js";
import { checkAdminAuth } from "./auth.js";
import {
  doc,
  deleteDoc,
  getDoc,
  updateDoc,
  increment,
  writeBatch,
  collection,
  getDocs,
  query,
  limit,
  startAfter,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import {
  ref,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-storage.js";

import { deleteCloudinaryImage } from "./deleteCloudinary.js";

// ── BATCH GET USERS ───────────────────────────────────────────────────────────
/**
 * Fetches multiple user documents by UID and returns them as a Map<uid, data>.
 *
 * Used by the Posts page to resolve usernames and profile pictures without
 * storing that data on every post document.
 *
 * Fetches are run in parallel (capped at 30 per chunk to stay under limits).
 *
 * @param {string[]} userIds - Array of user UIDs (duplicates are ignored)
 * @returns {Promise<Map<string, object>>} Map from uid → user document data
 */
export async function batchGetUsers(userIds) {
  const unique = [...new Set(userIds)].filter(Boolean);
  const cache = new Map();

  if (!unique.length) return cache;

  // Split into chunks of 30 and fetch all in parallel
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
            console.warn(
              `[batchGetUsers] Could not fetch user ${uid}:`,
              e.message,
            );
          }
        }),
      ),
    ),
  );

  console.log(`[batchGetUsers] Fetched ${cache.size} / ${unique.length} users`);
  return cache;
}

// ── DELETE POST ───────────────────────────────────────────────────────────────
/**
 * Deletes a post along with all its subcollections (likes, comments, viewers)
 * and its Cloudinary image. Also decrements counters on affected user documents.
 *
 * @param {string} postId
 * @returns {Promise<{success: boolean, message?: string, error?: string}>}
 */
export async function deletePost(postId) {
  try {
    const postRef = doc(db, "posts", postId);
    const postSnap = await getDoc(postRef);

    if (!postSnap.exists()) {
      return { success: false, error: "Post not found" };
    }

    const postData = postSnap.data();
    const likeCount = postData.likeCount || 0;
    const commentCount = postData.commentCount || 0;
    const postOwnerId = postData.userId;

    // ── Batch 1: post + owner counters ──────────────────────────────────
    let batch = writeBatch(db);
    let writes = 0;

    if (likeCount > 0 && postOwnerId) {
      batch.update(doc(db, "users", postOwnerId), {
        likesCount: increment(-likeCount),
      });
      writes++;
    }

    batch.delete(postRef);
    writes++;

    // ── Helper: drain a subcollection in batches of 500 ─────────────────
    async function drainSubcollection(colRef, label) {
      let lastDoc = null;

      while (true) {
        let q = query(colRef, limit(500 - writes));
        if (lastDoc)
          q = query(colRef, startAfter(lastDoc), limit(500 - writes));

        const snap = await getDocs(q);
        if (snap.empty) break;

        snap.forEach((d) => {
          batch.delete(d.ref);
          writes++;
        });

        lastDoc = snap.docs[snap.docs.length - 1];

        if (writes >= 500) {
          await batch.commit();
          batch = writeBatch(db);
          writes = 0;
        }
      }

      console.log(`✅ Drained subcollection [${label}] for post ${postId}`);
    }

    // ── Likes ────────────────────────────────────────────────────────────
    await drainSubcollection(collection(db, "posts", postId, "likes"), "likes");

    // ── Viewers ──────────────────────────────────────────────────────────
    await drainSubcollection(
      collection(db, "posts", postId, "views"),
      "viewers",
    );

    // ── Comments (track per-user counts) ─────────────────────────────────
    const commentsRef = collection(db, "posts", postId, "comments");
    const commentUserIds = new Map();
    let lastCommentDoc = null;

    while (true) {
      let q = query(commentsRef, limit(500 - writes));
      if (lastCommentDoc)
        q = query(commentsRef, startAfter(lastCommentDoc), limit(500 - writes));

      const snap = await getDocs(q);
      if (snap.empty) break;

      snap.forEach((commentDoc) => {
        const uid = commentDoc.data().userId;
        if (uid) commentUserIds.set(uid, (commentUserIds.get(uid) || 0) + 1);
        batch.delete(commentDoc.ref);
        writes++;
      });

      lastCommentDoc = snap.docs[snap.docs.length - 1];

      if (writes >= 500) {
        await batch.commit();
        batch = writeBatch(db);
        writes = 0;
      }
    }

    console.log(`✅ Deleted ${commentCount} comments for post ${postId}`);

    // ── Decrement commentsCount on each commenter ─────────────────────────
    for (const [uid, count] of commentUserIds) {
      if (writes >= 500) {
        await batch.commit();
        batch = writeBatch(db);
        writes = 0;
      }
      batch.update(doc(db, "users", uid), { commentsCount: increment(-count) });
      writes++;
    }

    if (writes > 0) await batch.commit();

    console.log(`✅ Post ${postId} fully deleted`);

    // ── Cloudinary image cleanup ──────────────────────────────────────────
    if (postData.cloudinaryId) {
      try {
        await deleteCloudinaryImage(postData.cloudinaryId);
      } catch (err) {
        console.error("Error deleting image from Cloudinary:", err);
      }
    }

    return {
      success: true,
      message: `Post deleted (${likeCount} likes, ${commentCount} comments removed)`,
    };
  } catch (error) {
    console.error("Error deleting post:", error);
    return { success: false, error: error.message };
  }
}

// ── GET POST DETAILS ──────────────────────────────────────────────────────────

/**
 * Fetches a single post document.
 *
 * @param {string} postId
 * @returns {Promise<{success: boolean, post?: object, error?: string}>}
 */
export async function getPostDetails(postId) {
  try {
    const snap = await getDoc(doc(db, "posts", postId));
    if (!snap.exists()) return { success: false, error: "Post not found" };
    return { success: true, post: { id: snap.id, ...snap.data() } };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ── DELETE MULTIPLE POSTS ─────────────────────────────────────────────────────

/**
 * Deletes an array of posts sequentially, returning per-post results.
 *
 * @param {string[]} postIds
 * @returns {Promise<Array<{postId: string, success: boolean, message?: string, error?: string}>>}
 */
export async function deleteMultiplePosts(postIds) {
  const results = [];
  for (const postId of postIds) {
    const result = await deletePost(postId);
    results.push({ postId, ...result });
  }
  return results;
}
