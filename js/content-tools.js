import { db } from "./firebase.js";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  where,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { deleteCloudinaryImage, deleteCloudinaryVideo } from "./deleteCloudinary.js";

export const CONTENT_SUBCOLLECTIONS = ["comments", "likes", "views"];

export function extractContentId(value) {
  const input = value.trim();
  if (!input) return "";
  try {
    const parts = new URL(input).pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] || input;
  } catch {
    return input.split("/").filter(Boolean).pop() || input;
  }
}

function collectionName(type) {
  return type === "video" ? "video-posts" : "posts";
}

export async function findUser(identifier) {
  let userSnap = await getDoc(doc(db, "users", identifier));
  if (!userSnap.exists()) {
    const usernameQuery = await getDocs(
      query(
        collection(db, "users"),
        where("username", "==", identifier),
        limit(1),
      ),
    );
    if (usernameQuery.empty) return null;
    userSnap = usernameQuery.docs[0];
  }
  const userId = userSnap.id;
  const [accountSnap, followersSnap] = await Promise.all([
    getDoc(doc(db, "users", userId, "privacy", "account")),
    getDoc(doc(db, "users", userId, "counters", "followers")),
  ]);
  return {
    id: userSnap.id,
    ...userSnap.data(),
    email: accountSnap.exists() ? accountSnap.data().email || "" : "",
    followersCount: followersSnap.exists() ? Number(followersSnap.data().followersCount) || 0 : 0,
  };
}

async function readCounters(type, id) {
  const name = collectionName(type);
  const entries = await Promise.all(CONTENT_SUBCOLLECTIONS.map(async (counter) => {
    const snap = await getDoc(doc(db, name, id, "counters", counter));
    return [counter, snap.exists() ? snap.data() : {}];
  }));
  return Object.fromEntries(entries);
}

export async function findPost(id, type = "post") {
  const snap = await getDoc(doc(db, collectionName(type), id));
  if (!snap.exists()) return null;
  const counters = await readCounters(type, id);
  return {
    id: snap.id,
    type,
    ...snap.data(),
    likesCount: Number(counters.likes.likesCount) || 0,
    commentsCount: Number(counters.comments.commentsCount) || 0,
    viewsCount: Number(counters.views.viewsCount) || 0,
  };
}

export async function inspectDeletion(id, type) {
  const post = await findPost(id, type);
  if (!post) return { exists: false, post: null, collections: {} };
  const name = collectionName(type);
  const entries = await Promise.all(CONTENT_SUBCOLLECTIONS.map(async (subcollection) => {
    const snap = await getDocs(query(collection(db, name, id, subcollection), limit(1)));
    return [subcollection, !snap.empty];
  }));
  return { exists: true, post, collections: Object.fromEntries(entries) };
}

export async function deleteContentBatch(id, type, subcollection) {
  if (!CONTENT_SUBCOLLECTIONS.includes(subcollection)) throw new Error("Unsupported content subcollection.");
  const name = collectionName(type);
  const snapshot = await getDocs(query(collection(db, name, id, subcollection), limit(500)));
  if (snapshot.empty) {
    if (subcollection === "likes") {
      await settleLikesCounter(id, type);
    } else {
      await deleteDoc(doc(db, name, id, "counters", subcollection));
    }
    return { success: true, deleted: 0, remaining: false, counterDeleted: true };
  }
  const batch = writeBatch(db);
  snapshot.docs.forEach((item) => batch.delete(item.ref));
  await batch.commit();
  return { success: true, deleted: snapshot.size, remaining: snapshot.size === 500 };
}

async function settleLikesCounter(id, type) {
  const name = collectionName(type);
  await runTransaction(db, async (transaction) => {
    const postRef = doc(db, name, id);
    const likesCounterRef = doc(db, name, id, "counters", "likes");
    const [postSnap, likesCounterSnap] = await Promise.all([
      transaction.get(postRef),
      transaction.get(likesCounterRef),
    ]);
    if (!likesCounterSnap.exists()) return;

    const post = postSnap.exists() ? postSnap.data() : {};
    const likesCounter = likesCounterSnap.data();
    const ownerId = post.userId;
    const likeTotal = Number(likesCounter.likesCount) || 0;

    if (ownerId && likeTotal > 0) {
      const ownerLikesRef = doc(db, "users", ownerId, "counters", "likes");
      const ownerLikesSnap = await transaction.get(ownerLikesRef);
      const ownerLikes = ownerLikesSnap.exists() ? ownerLikesSnap.data() : {};
      transaction.set(
        ownerLikesRef,
        {
          likesCount: Math.max(
            0,
            (Number(ownerLikes.likesCount) || 0) - likeTotal,
          ),
        },
        { merge: true },
      );
    }
    transaction.delete(likesCounterRef);
  });
}

async function removeAsset(post, field, removeAsset) {
  if (!post[field]) return;
  try {
    await removeAsset(post[field]);
  } catch (error) {
    if (!/not found|not_found/i.test(error.message)) throw error;
  }
}

export async function finalizeContentDeletion(id, type) {
  const state = await inspectDeletion(id, type);
  if (!state.exists) return { success: true, deleted: true, message: "Content is already deleted." };
  const blocked = CONTENT_SUBCOLLECTIONS.filter((name) => state.collections[name]);
  if (blocked.length) return { success: false, deleted: false, blocked, message: `Delete ${blocked.join(", ")} before deleting the ${type === "video" ? "video" : "post"}.` };

  const post = state.post;
  if (type === "video") {
    await removeAsset(post, "cloudinaryId", deleteCloudinaryVideo);
    await removeAsset(post, "thumbnailCloudinaryId", deleteCloudinaryImage);
  } else {
    await removeAsset(post, "cloudinaryId", deleteCloudinaryImage);
  }

  const userId = post.userId;
  await runTransaction(db, async (transaction) => {
    if (userId) {
      const postsRef = doc(db, "users", userId, "counters", "posts");
      const postsSnap = await transaction.get(postsRef);
      const postsData = postsSnap.exists() ? postsSnap.data() : {};
      const postField = type === "video" ? "videosCount" : "postsCount";
      transaction.set(postsRef, { [postField]: Math.max(0, (Number(postsData[postField]) || 0) - 1) }, { merge: true });
    }
    const contentRef = doc(db, collectionName(type), id);
    CONTENT_SUBCOLLECTIONS.forEach((name) => {
      transaction.delete(doc(db, collectionName(type), id, "counters", name));
    });
    transaction.delete(contentRef);
  });
  return { success: true, deleted: true, message: "Content and media deleted successfully." };
}

export async function deleteContent(id, type) {
  return finalizeContentDeletion(id, type);
}
