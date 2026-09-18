/* ================================================================
   JOYIN ADMIN — DASHBOARD MODULE
   Handles: stats aggregation, user list, post list, search
   ================================================================ */

import { auth, db } from "./firebase.js";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  getCountFromServer,
  query,
  orderBy,
  limit,
  startAfter,
  where,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

// ── FETCH ALL USERS ───────────────────────────────────────────

/**
 * Returns every document from the /users collection as a plain array.
 *
 * @returns {Promise<object[]>} Array of user objects with `id` injected
 */
export async function getAllUsers() {
  const snapshot = await getDocs(collection(db, "users"));
  return Promise.all(
    snapshot.docs.map(async (userDoc) => {
      const user = { id: userDoc.id, ...userDoc.data() };
      const [accountSnap, postsCounterSnap, followersCounterSnap] =
        await Promise.all([
          getDoc(doc(db, "users", userDoc.id, "privacy", "account")),
          getDoc(doc(db, "users", userDoc.id, "counters", "posts")),
          getDoc(doc(db, "users", userDoc.id, "counters", "followers")),
        ]);

      const account = accountSnap.exists() ? accountSnap.data() : {};
      const postsCounter = postsCounterSnap.exists()
        ? postsCounterSnap.data()
        : {};
      const followersCounter = followersCounterSnap.exists()
        ? followersCounterSnap.data()
        : {};

      return {
        ...user,
        displayName: user.displayName || "",
        email: account.email || "",
        postsCount: Number(postsCounter.postsCount) || 0,
        videosCount: Number(postsCounter.videosCount) || 0,
        followersCount: Number(followersCounter.followersCount) || 0,
      };
    }),
  );
}

export async function getUsersPage(cursor = null, pageSize = 10) {
  const [totalSnapshot, snapshot] = await Promise.all([
    getCountFromServer(collection(db, "users")),
    getDocs(
      query(
        collection(db, "users"),
        ...(cursor
          ? [orderBy("createdAt", "desc"), startAfter(cursor), limit(pageSize + 1)]
          : [orderBy("createdAt", "desc"), limit(pageSize + 1)]),
      ),
    ),
  ]);
  const hasNextPage = snapshot.docs.length > pageSize;
  const docs = snapshot.docs.slice(0, pageSize);

  const users = await Promise.all(
    docs.map(async (userDoc) => {
      const user = { id: userDoc.id, ...userDoc.data() };
      const [accountSnap, postsCounterSnap, followersCounterSnap] =
        await Promise.all([
          getDoc(doc(db, "users", userDoc.id, "privacy", "account")),
          getDoc(doc(db, "users", userDoc.id, "counters", "posts")),
          getDoc(doc(db, "users", userDoc.id, "counters", "followers")),
        ]);
      const account = accountSnap.exists() ? accountSnap.data() : {};
      const postsCounter = postsCounterSnap.exists()
        ? postsCounterSnap.data()
        : {};
      const followersCounter = followersCounterSnap.exists()
        ? followersCounterSnap.data()
        : {};
      return {
        ...user,
        displayName: user.displayName || "",
        email: account.email || "",
        postsCount: Number(postsCounter.postsCount) || 0,
        videosCount: Number(postsCounter.videosCount) || 0,
        followersCount: Number(followersCounter.followersCount) || 0,
      };
    }),
  );

  return {
    users,
    nextCursor: hasNextPage ? docs[docs.length - 1] : null,
    hasNextPage,
    totalCount: totalSnapshot.data().count,
  };
}

// ── FETCH ALL POSTS ───────────────────────────────────────────

/**
 * Returns every document from /posts, sorted newest first.
 * We fetch the full documents here because the dashboard chart
 * needs per-date data to build the "Posts per Day" graph.
 *
 * @returns {Promise<object[]>} Array of post objects with `id` injected
 */
export async function getAllPosts() {
  const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);
  return Promise.all(
    snapshot.docs.map(async (postDoc) => {
      const [likesSnap, viewsSnap] = await Promise.all([
        getDoc(doc(db, "posts", postDoc.id, "counters", "likes")),
        getDoc(doc(db, "posts", postDoc.id, "counters", "views")),
      ]);
      const likes = likesSnap.exists() ? likesSnap.data() : {};
      const views = viewsSnap.exists() ? viewsSnap.data() : {};

      return {
        id: postDoc.id,
        ...postDoc.data(),
        likesCount: Number(likes.likesCount) || 0,
        viewsCount: Number(views.viewsCount) || 0,
      };
    }),
  );
}

export async function getPostsPage(cursor = null, pageSize = 10) {
  const [totalSnapshot, snapshot] = await Promise.all([
    getCountFromServer(collection(db, "posts")),
    getDocs(
      query(
        collection(db, "posts"),
        ...(cursor
          ? [orderBy("createdAt", "desc"), startAfter(cursor), limit(pageSize + 1)]
          : [orderBy("createdAt", "desc"), limit(pageSize + 1)]),
      ),
    ),
  ]);
  const hasNextPage = snapshot.docs.length > pageSize;
  const docs = snapshot.docs.slice(0, pageSize);
  const posts = await Promise.all(
    docs.map(async (postDoc) => {
      const [likesSnap, viewsSnap] = await Promise.all([
        getDoc(doc(db, "posts", postDoc.id, "counters", "likes")),
        getDoc(doc(db, "posts", postDoc.id, "counters", "views")),
      ]);
      return {
        id: postDoc.id,
        ...postDoc.data(),
        likesCount: likesSnap.exists()
          ? Number(likesSnap.data().likesCount) || 0
          : 0,
        viewsCount: viewsSnap.exists()
          ? Number(viewsSnap.data().viewsCount) || 0
          : 0,
      };
    }),
  );
  return {
    posts,
    nextCursor: hasNextPage ? docs[docs.length - 1] : null,
    hasNextPage,
    totalCount: totalSnapshot.data().count,
  };
}

// ── FETCH ALL VIDEO POSTS ─────────────────────────────────────

/**
 * Returns every document from /video-posts, sorted newest first.
 * Used by the Video Posts admin page — not needed by the dashboard
 * which uses getVideoPostCount() instead to avoid over-fetching.
 *
 * @returns {Promise<object[]>} Array of video post objects with `id` injected
 */
export async function getAllVideoPosts() {
  const q = query(collection(db, "video-posts"), orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getVideoPostsPage(cursor = null, pageSize = 20) {
  const today = new Date();
  const startOfDay = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const [totalSnapshot, todaySnapshot, snapshot] = await Promise.all([
    getCountFromServer(collection(db, "video-posts")),
    getCountFromServer(
      query(collection(db, "video-posts"), where("createdAt", ">=", startOfDay)),
    ),
    getDocs(
      query(
        collection(db, "video-posts"),
        ...(cursor
          ? [orderBy("createdAt", "desc"), startAfter(cursor), limit(pageSize + 1)]
          : [orderBy("createdAt", "desc"), limit(pageSize + 1)]),
      ),
    ),
  ]);
  const hasNextPage = snapshot.docs.length > pageSize;
  const docs = snapshot.docs.slice(0, pageSize);
  return {
    posts: await Promise.all(
      docs.map(async (videoDoc) => {
        const [likesSnap, commentsSnap, viewsSnap] = await Promise.all([
          getDoc(doc(db, "video-posts", videoDoc.id, "counters", "likes")),
          getDoc(doc(db, "video-posts", videoDoc.id, "counters", "comments")),
          getDoc(doc(db, "video-posts", videoDoc.id, "counters", "views")),
        ]);
        return {
          id: videoDoc.id,
          ...videoDoc.data(),
          likesCount: likesSnap.exists()
            ? Number(likesSnap.data().likesCount) || 0
            : 0,
          commentsCount: commentsSnap.exists()
            ? Number(commentsSnap.data().commentsCount) || 0
            : 0,
          viewsCount: viewsSnap.exists()
            ? Number(viewsSnap.data().viewsCount) || 0
            : 0,
        };
      }),
    ),
    nextCursor: hasNextPage ? docs[docs.length - 1] : null,
    hasNextPage,
    totalCount: totalSnapshot.data().count,
    todayCount: todaySnapshot.data().count,
  };
}

export async function getPostManagementStats() {
  const today = new Date();
  const startOfDay = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const collections = ["posts", "video-posts"];
  const [totalPosts, totalVideos, todayPosts, todayVideos, withImages] =
    await Promise.all([
      getCountFromServer(collection(db, collections[0])),
      getCountFromServer(collection(db, collections[1])),
      getCountFromServer(
        query(collection(db, collections[0]), where("createdAt", ">=", startOfDay)),
      ),
      getCountFromServer(
        query(collection(db, collections[1]), where("createdAt", ">=", startOfDay)),
      ),
      getCountFromServer(
        query(collection(db, collections[0]), where("imageUrl", "!=", "")),
      ),
    ]);
  return {
    total: totalPosts.data().count + totalVideos.data().count,
    today: todayPosts.data().count + todayVideos.data().count,
    withImages: withImages.data().count,
  };
}

// ── SERVER-SIDE COUNTS ────────────────────────────────────────

/**
 * Gets the total number of video posts directly from the Firestore
 * server using the efficient getCountFromServer() API.
 *
 * This avoids downloading every video-post document just to count them —
 * Firestore computes the count server-side and returns a single number.
 * Much cheaper in terms of reads and bandwidth.
 *
 * @returns {Promise<number>}
 */
export async function getVideoPostCount() {
  try {
    const snapshot = await getCountFromServer(collection(db, "video-posts"));
    return snapshot.data().count;
  } catch (err) {
    console.warn(
      "[getVideoPostCount] Falling back to manual count:",
      err.message,
    );
    // Fallback: fetch docs and count manually if getCountFromServer is unavailable
    const snap = await getDocs(collection(db, "video-posts"));
    return snap.size;
  }
}

/**
 * Gets the total number of regular posts from the server.
 * Used as a lightweight alternative to getAllPosts() when you
 * only need the count (e.g. for a secondary stat display).
 *
 * @returns {Promise<number>}
 */
export async function getPostCount() {
  try {
    const snapshot = await getCountFromServer(collection(db, "posts"));
    return snapshot.data().count;
  } catch (err) {
    console.warn("[getPostCount] Falling back to manual count:", err.message);
    const snap = await getDocs(collection(db, "posts"));
    return snap.size;
  }
}

// ── DASHBOARD STATS ───────────────────────────────────────────

/**
 * Aggregates key metrics for the dashboard overview cards and charts.
 *
 * Strategy:
 *  - Users:       full fetch (needed for banned/active breakdown + chart)
 *  - Posts:       full fetch (needed for postsByDate chart)
 *  - Video posts: server-side count only (not needed for any chart yet)
 *
 * All three requests run in parallel via Promise.all for speed.
 *
 * Returned values:
 *  - totalUsers, activeUsers, bannedUsers, newUsersToday
 *  - totalPosts      — count of /posts documents
 *  - totalVideoPosts — count of /video-posts documents (server-side)
 *  - postsByDate     — map of "M/D/YYYY" → count (for the chart)
 *
 * @returns {Promise<object>} Stats object
 */
export async function getAdminStatsFixed() {
  // Fire all three requests simultaneously — don't wait for one before starting the next
  const [users, posts, videoPostCount] = await Promise.all([
    getAllUsers(),
    getAllPosts(),
    getVideoPostCount(),
  ]);

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // ── User breakdown ──
  const bannedUsers = users.filter(
    (u) => u.isBanned === true,
  ).length;
  const activeUsers = users.length - bannedUsers;
  const newUsersToday = users.filter((u) => {
    const d = u.createdAt?.toDate
      ? u.createdAt.toDate()
      : new Date(u.createdAt);
    return d >= today;
  }).length;

  // ── Posts-per-day map for the chart ──
  // Format: { "1/1/2025": 4, "1/2/2025": 7, … }
  const postsByDate = {};
  posts.forEach((p) => {
    const d = p.createdAt?.toDate
      ? p.createdAt.toDate()
      : new Date(p.createdAt);
    const key = d.toLocaleDateString();
    postsByDate[key] = (postsByDate[key] || 0) + 1;
  });

  return {
    totalUsers: users.length,
    activeUsers,
    bannedUsers,
    newUsersToday,
    totalPosts: posts.length, // regular posts only
    totalVideoPosts: videoPostCount, // video-posts (server count)
    totalAllContent: posts.length + videoPostCount, // combined for quick reference
    postsByDate,
  };
}

// ── CLIENT-SIDE SEARCH ────────────────────────────────────────

/**
 * Filters a pre-loaded user array by a search term.
 * Matches against username, email, and user ID.
 *
 * @param {string} searchTerm - Case-insensitive search string
 * @returns {Promise<object[]>} Matching users
 */
export async function searchUsers(searchTerm) {
  const users = await getAllUsers();
  const term = searchTerm.toLowerCase();

  return users.filter(
    (u) =>
      (u.username || "").toLowerCase().includes(term) ||
      (u.email || "").toLowerCase().includes(term) ||
      u.id.toLowerCase().includes(term),
  );
}
