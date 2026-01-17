// admin/js/posts.js
import { auth, db, storage } from './firebase.js';
import { checkAdminAuth } from './auth.js';
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
    startAfter
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { 
    ref, 
    deleteObject 
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-storage.js";

// Delete post (with image and like count adjustment)
export async function deletePost(postId) {
  try {
    const postRef = doc(db, "posts", postId);
    const postSnap = await getDoc(postRef);

    if (!postSnap.exists()) {
      return { success: false, error: "Post not found" };
    }

    const postData = postSnap.data();
    const likeCount = postData.likeCount || 0;
    const postOwnerId = postData.userId;

    // 1️⃣ Prepare first batch
    let batch = writeBatch(db);
    let writes = 0;

    // Update post owner's likesCount if needed
    if (likeCount > 0 && postOwnerId) {
      const userRef = doc(db, "users", postOwnerId);
      batch.update(userRef, { likesCount: increment(-likeCount) });
      writes++;
    }

    // Delete the post itself
    batch.delete(postRef);
    writes++;

    // 2️⃣ Delete likes subcollection in batches
    const likesRef = collection(db, "posts", postId, "likes");
    let lastDoc = null;

    while (true) {
      let likesQuery = query(likesRef, limit(500 - writes));
      if (lastDoc) likesQuery = query(likesRef, startAfter(lastDoc), limit(500 - writes));

      const likesSnap = await getDocs(likesQuery);
      if (likesSnap.empty) break;

      likesSnap.forEach((likeDoc) => {
        batch.delete(likeDoc.ref);
        writes++;
      });

      lastDoc = likesSnap.docs[likesSnap.docs.length - 1];

      // Commit current batch if we reach 500 writes
      if (writes >= 500) {
        await batch.commit();
        batch = writeBatch(db);
        writes = 0;
      }
    }

    // Commit remaining batch
    if (writes > 0) {
      await batch.commit();
    }

    console.log(`✅ Post ${postId} and all likes deleted`);

    // 3️⃣ Delete image from storage (cannot batch)
    if (postData.imageUrl) {
      try {
        const imagePath = decodeURIComponent(postData.imageUrl.split("/o/")[1]?.split("?")[0]);
        if (imagePath) {
          const imageRef = ref(storage, imagePath);
          await deleteObject(imageRef);
          console.log(`✅ Image deleted: ${imagePath}`);
        }
      } catch (storageError) {
        console.warn("Could not delete image from storage:", storageError);
      }
    }

    return { success: true, message: `Post ${postId} deleted successfully` };

  } catch (error) {
    console.error("Error deleting post:", error);
    return { success: false, error: error.message };
  }
}




// Get post details
export async function getPostDetails(postId) {
    try {
        const postRef = doc(db, "posts", postId);
        const postSnap = await getDoc(postRef);
        
        if (postSnap.exists()) {
            return { 
                success: true, 
                post: { id: postSnap.id, ...postSnap.data() } 
            };
        } else {
            return { success: false, error: "Post not found" };
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Delete multiple posts
export async function deleteMultiplePosts(postIds) {
    const results = [];
    for (const postId of postIds) {
        const result = await deletePost(postId);
        results.push({ postId, ...result });
    }
    return results;
}


// https://console.cloud.google.com/billing/01BDFD-69B718-989D39?authuser=1&organizationId=0(https://console.cloud.google.com/welcome?authuser=1&organizationId=0)