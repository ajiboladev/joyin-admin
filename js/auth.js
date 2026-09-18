/* ================================================================
   JOYIN ADMIN — AUTH MODULE
   Handles: admin login, logout, session check, admin creation
   ================================================================ */

import { auth, db, isAdmin, ADMIN_COLLECTION } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import {
  doc,
  setDoc,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

// ── ADMIN LOGIN ───────────────────────────────────────────────

/**
 * Signs in with email/password and verifies admin role.
 *
 * Flow:
 *  1. Firebase Auth signs in the user
 *  2. We look up /joyinAccessRegistry/{uid} in Firestore to confirm admin role
 *  3. If not admin, we immediately sign them back out for safety
 *
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{success: boolean, user?: object, error?: string}>}
 */
export async function adminLogin(email, password) {
  try {
    // Step 1: Authenticate with Firebase Auth
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const uid = credential.user.uid;

    // Step 2: Check the admin access record
    if (await isAdmin(uid)) {
      // All good — return the user object
      return { success: true, user: credential.user };
    } else {
      // Authenticated but NOT an admin — force sign out immediately
      await signOut(auth);
      return { success: false, error: "Access denied: not an admin account." };
    }
  } catch (error) {
    // Firebase Auth error codes we want to translate to friendly messages
    const messages = {
      "auth/user-not-found": "No account found with this email.",
      "auth/wrong-password": "Incorrect password.",
      "auth/invalid-email": "Please enter a valid email address.",
      "auth/too-many-requests":
        "Too many failed attempts. Please try again later.",
      "auth/user-disabled": "This account has been disabled.",
      "auth/invalid-credential": "Incorrect email or password.",
    };

    const friendly = messages[error.code] || error.message;
    console.error("[adminLogin] error:", error.code, error.message);
    return { success: false, error: friendly };
  }
}

// ── CREATE ADMIN ACCOUNT ──────────────────────────────────────

/**
 * Creates a new admin account in Firebase Auth and records it in
 * the admin access collection. This function should only be called once
 * during initial setup — protect it with a setup key in the UI.
 *
 * @param {string} email
 * @param {string} password
 * @param {string} username - Display name for the admin
 * @returns {Promise<{success: boolean, userId?: string, error?: string}>}
 */
export async function createAdmin(email, password, username) {
  try {
    // Create the Firebase Auth account
    const credential = await createUserWithEmailAndPassword(
      auth,
      email,
      password,
    );
    const uid = credential.user.uid;

    // Write the admin record to Firestore
    // Use the same collection that isAdmin() checks
    await setDoc(doc(db, ADMIN_COLLECTION, uid), {
      email: email,
      username: username,
      role: "admin",
      createdAt: new Date(),
    });

    console.log("[createAdmin] Admin created:", uid);
    return { success: true, userId: uid };
  } catch (error) {
    console.error("[createAdmin] error:", error.code, error.message);
    return { success: false, error: error.message };
  }
}

// ── GUARD: CHECK IF CURRENT USER IS ADMIN ────────────────────

/**
 * Checks the current auth state and verifies admin role.
 * Returns the Firebase user object if valid, otherwise null.
 *
 * Used at the top of every protected page like:
 *   const user = await checkAdminAuth();
 *   if (!user) window.location.href = 'index.html';
 *
 * Wraps onAuthStateChanged in a Promise so it works with async/await.
 *
 * @returns {Promise<object|null>} Firebase user or null
 */
export function checkAdminAuth() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (user && (await isAdmin(user.uid))) {
        resolve(user);
      } else {
        // Either not logged in, or logged in but not admin
        resolve(null);
      }
    });
  });
}

// ── LOGOUT ───────────────────────────────────────────────────

/**
 * Signs the admin out of Firebase Auth and redirects to the login page.
 * Handles errors gracefully — redirect happens even if signOut fails.
 */
export async function adminLogout() {
  try {
    await signOut(auth);
    console.log("[adminLogout] Signed out successfully");
  } catch (error) {
    // Even if sign-out fails, redirect anyway
    console.error("[adminLogout] error:", error.message);
  } finally {
    window.location.href = "index.html";
  }
}
