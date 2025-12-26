// admin/js/posts.js
import { auth, db, storage } from './firebase.js';
import { checkAdminAuth } from './auth.js';
import { 
    doc, 
    deleteDoc,
    getDoc 
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { 
    ref, 
    deleteObject 
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-storage.js";

// Delete post (with image)
export async function deletePost(postId) {
    try {
        // First get the post to check for image
        const postRef = doc(db, "posts", postId);
        const postSnap = await getDoc(postRef);
        
        if (!postSnap.exists()) {
            return { success: false, error: "Post not found" };
        }
        
        const postData = postSnap.data();
        
        // Delete image from storage if exists
        if (postData.imageUrl) {
            try {
                // Extract the path from the URL
                const imagePath = decodeURIComponent(postData.imageUrl.split('/o/')[1]?.split('?')[0]);
                if (imagePath) {
                    const imageRef = ref(storage, imagePath);
                    await deleteObject(imageRef);
                    console.log(`✅ Image deleted: ${imagePath}`);
                }
            } catch (storageError) {
                console.warn("Could not delete image:", storageError);
                // Continue deleting post even if image fails
            }
        }
        
        // Delete the post document
        await deleteDoc(postRef);
        
        return { success: true, message: `Post ${postId} deleted` };
    } catch (error) {
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