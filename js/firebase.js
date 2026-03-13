// admin/js/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-storage.js";

// Your Firebase config (same as main app)
const firebaseConfig = {
  apiKey: "AIzaSyDUBllvOmhR7O0KqjeWoxsMnxuHoWoNJYA",
  authDomain: "joyin-001.firebaseapp.com",
  projectId: "joyin-001",
  storageBucket: "joyin-001.firebasestorage.app",
  messagingSenderId: "557041273144",
  appId: "1:557041273144:web:a512b2e9df2c96b93399cd",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig, "JOYIN-Admin");
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Admin check function
export async function isAdmin(userId) {
  const { doc, getDoc } =
    await import("https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js");
  const adminRef = doc(db, "admins", userId);
  const adminSnap = await getDoc(adminRef);
  return adminSnap.exists();
}
