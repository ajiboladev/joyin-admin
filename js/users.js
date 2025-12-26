// admin/js/users.js
import { auth, db } from './firebase.js';
import { checkAdminAuth } from './auth.js';
import { 
    doc, 
    updateDoc, 
    getDoc,
    collection,
    getDocs,
    query,
    where 
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

// Ban user
export async function banUser(userId, banReason = "Violation of community guidelines") {
    try {
        const userRef = doc(db, "users", userId);
        await updateDoc(userRef, {
            softBan: true,
            // banReason: banReason,
            banStartDate: new Date(),
            // bannedAt: new Date(),
            // adminContact: "admin@joyin.com"
        });
        
        return { success: true, message: `User ${userId} banned` };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Unban user
export async function unbanUser(userId) {
    try {
        const userRef = doc(db, "users", userId);
        await updateDoc(userRef, {
            softBan: false,
            banReason: "",
            banStartDate: null
        });
        
        return { success: true, message: `User ${userId} unbanned` };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Get user details
export async function getUserDetails(userId) {
    try {
        const userRef = doc(db, "users", userId);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
            return { 
                success: true, 
                user: { id: userSnap.id, ...userSnap.data() } 
            };
        } else {
            return { success: false, error: "User not found" };
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Get user's posts
export async function getUserPosts(userId) {
    try {
        const { collection, query, where, getDocs } = await import("https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js");
        
        const postsRef = collection(db, "posts");
        const q = query(postsRef, where("userId", "==", userId));
        const snapshot = await getDocs(q);
        
        const posts = [];
        snapshot.forEach((doc) => {
            posts.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        return { success: true, posts: posts };
    } catch (error) {
        return { success: false, error: error.message };
    }
}