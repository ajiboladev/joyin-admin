// admin/js/auth.js
import { auth, db, isAdmin } from './firebase.js';
import { 
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

// Admin login
export async function adminLogin(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const userId = userCredential.user.uid;
        
        if (await isAdmin(userId)) {
            return { success: true, user: userCredential.user };
        } else {
            await signOut(auth);
            return { success: false, error: "Not authorized as admin" };
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Create admin (run once)
export async function createAdmin(email, password, username) {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const userId = userCredential.user.uid;
        
        await setDoc(doc(db, "admins", userId), {
            email: email,
            username: username,
            role: "admin",
            createdAt: new Date()
        });
        
        return { success: true, userId: userId };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Check current admin
export function checkAdminAuth() {
    return new Promise((resolve) => {
        onAuthStateChanged(auth, async (user) => {
            if (user && await isAdmin(user.uid)) {
                resolve(user);
            } else {
                resolve(null);
            }
        });
    });
}

// Admin logout
export async function adminLogout() {
    await signOut(auth);
    window.location.href = "index.html";
}