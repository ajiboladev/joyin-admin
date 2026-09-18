/* ================================================================
   JOYIN ADMIN — USERS MODULE
   Handles: ban, unban, fetch user posts, get user details,
            batch post-count resolution across both collections
   ================================================================ */

import { auth, db } from "./firebase.js";
import {
  doc,
  updateDoc,
  getDoc,
  collection,
  getDocs,
  getCountFromServer,
  query,
  where,
  orderBy,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

// ── BAN USER ──────────────────────────────────────────────────

export async function banUser(
  userId,
  banReason = "Violation of community guidelines",
) {
  try {
    const userRef = doc(db, "users", userId);
    await updateDoc(userRef, {
      isBanned: true,
      banReason: banReason,
      banStartDate: new Date(),
      updatedAt: new Date(),
    });
    console.log(`[banUser] User ${userId} banned — reason: "${banReason}"`);
    return { success: true, message: "User banned successfully." };
  } catch (error) {
    console.error("[banUser] error:", error.message);
    return { success: false, error: error.message };
  }
}

// ── UNBAN USER ────────────────────────────────────────────────

export async function unbanUser(userId) {
  try {
    const userRef = doc(db, "users", userId);
    await updateDoc(userRef, {
      isBanned: false,
      banReason: "",
      banStartDate: null,
      updatedAt: new Date(),
    });
    console.log(`[unbanUser] User ${userId} unbanned`);
    return { success: true, message: "User unbanned successfully." };
  } catch (error) {
    console.error("[unbanUser] error:", error.message);
    return { success: false, error: error.message };
  }
}

// ── GET USER DETAILS ──────────────────────────────────────────

export async function getUserDetails(userId) {
  try {
    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return { success: false, error: "User not found." };
    return { success: true, user: { id: userSnap.id, ...userSnap.data() } };
  } catch (error) {
    console.error("[getUserDetails] error:", error.message);
    return { success: false, error: error.message };
  }
}

// ── BATCH POST COUNTS ─────────────────────────────────────────

/**
 * Fetches post counts for an array of user IDs from BOTH /posts
 * and /video-posts using getCountFromServer().
 *
 * getCountFromServer runs the count server-side — no documents are
 * downloaded, so it's very cheap (1 read unit per query regardless
 * of how many documents match).
 *
 * All queries run in parallel so the total time is just one
 * round-trip no matter how many users there are.
 *
 * @param {string[]} userIds
 * @returns {Promise<Map<string, { posts: number, videoPosts: number, total: number }>>}
 */
export async function batchGetPostCounts(userIds) {
  const unique = [...new Set(userIds)].filter(Boolean);
  const counts = new Map();
  if (!unique.length) return counts;

  // Seed every uid at zero so the map is always complete even on partial failures
  unique.forEach((uid) =>
    counts.set(uid, { posts: 0, videoPosts: 0, total: 0 }),
  );

  await Promise.all(
    unique.flatMap((uid) => [
      // Regular /posts count for this user
      getCountFromServer(
        query(collection(db, "posts"), where("userId", "==", uid)),
      )
        .then((snap) => {
          const c = counts.get(uid);
          c.posts = snap.data().count;
          c.total = c.posts + c.videoPosts;
        })
        .catch((e) =>
          console.warn(`[batchGetPostCounts] posts/${uid}:`, e.message),
        ),

      // /video-posts count for this user
      getCountFromServer(
        query(collection(db, "video-posts"), where("userId", "==", uid)),
      )
        .then((snap) => {
          const c = counts.get(uid);
          c.videoPosts = snap.data().count;
          c.total = c.posts + c.videoPosts;
        })
        .catch((e) =>
          console.warn(`[batchGetPostCounts] video-posts/${uid}:`, e.message),
        ),
    ]),
  );

  console.log(
    `[batchGetPostCounts] Resolved counts for ${unique.length} users`,
  );
  return counts;
}

// ── GET USER'S POSTS (both collections) ──────────────────────

/**
 * Fetches all posts (regular + video) authored by a specific user,
 * merged and sorted newest first. Used by the detail modal.
 *
 * @param {string} userId
 * @returns {Promise<{success: boolean, posts?: object[], error?: string}>}
 */
export async function getUserPosts(userId) {
  try {
    const [regularSnap, videoSnap] = await Promise.all([
      getDocs(
        query(
          collection(db, "posts"),
          where("userId", "==", userId),
          orderBy("createdAt", "desc"),
        ),
      ),
      getDocs(
        query(
          collection(db, "video-posts"),
          where("userId", "==", userId),
          orderBy("createdAt", "desc"),
        ),
      ),
    ]);

    const regularPosts = regularSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      type: "post",
    }));
    const videoPosts = videoSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      type: "video",
    }));

    const all = [...regularPosts, ...videoPosts].sort((a, b) => {
      const dA = a.createdAt?.toDate?.() || new Date(0);
      const dB = b.createdAt?.toDate?.() || new Date(0);
      return dB - dA;
    });

    console.log(
      `[getUserPosts] ${all.length} posts (${regularPosts.length} text, ${videoPosts.length} video) for user ${userId}`,
    );
    return { success: true, posts: all };
  } catch (error) {
    console.error("[getUserPosts] error:", error.message);
    return { success: false, error: error.message, posts: [] };
  }
}
