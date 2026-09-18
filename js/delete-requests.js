import { db } from "./firebase.js";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  startAfter,
  where,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

export const REQUEST_PAGE_SIZE = 50;

export async function fetchDeleteRequests(
  collectionName,
  cursor = null,
  timestampField = "timestamp",
  olderThan = null,
) {
  const constraints = [
    orderBy(timestampField, "desc"),
    limit(REQUEST_PAGE_SIZE),
  ];
  if (olderThan) constraints.unshift(where(timestampField, "<=", olderThan));
  if (cursor) constraints.splice(1, 0, startAfter(cursor));
  const snapshot = await getDocs(
    query(collection(db, collectionName), ...constraints),
  );
  return {
    requests: snapshot.docs.map((requestDoc) => ({
      id: requestDoc.id,
      ...requestDoc.data(),
    })),
    nextCursor: snapshot.empty
      ? cursor
      : snapshot.docs[snapshot.docs.length - 1],
    hasMore: snapshot.size === REQUEST_PAGE_SIZE,
  };
}

export async function deleteDeleteRequest(collectionName, requestId) {
  await deleteDoc(doc(db, collectionName, requestId));
}

export async function restoreAccountDeletionRequest(
  collectionName,
  requestId,
  uid,
) {
  if (!collectionName || !requestId || !uid) {
    throw new Error("Missing account request data.");
  }

  const requestRef = doc(db, collectionName, requestId);
  const userRef = doc(db, "users", uid);

  await runTransaction(db, async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists()) {
      throw new Error(`User ${uid} was not found.`);
    }

    transaction.update(userRef, {
      accountStatus: false,
      updatedAt: new Date(),
    });
    transaction.delete(requestRef);
  });
}
