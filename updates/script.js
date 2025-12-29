// admin/script.js - COMPLETE WORKING VERSION
import { auth, db } from '../js/firebase.js';
import { 
  doc, setDoc, updateDoc, deleteDoc,
  collection, query, where, orderBy, 
  getDocs, serverTimestamp, limit
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

// ===== DASHBOARD FUNCTIONS =====

export async function loadDashboardStats() {
  try {
    console.log("📊 Loading dashboard stats...");
    
    const updatesRef = collection(db, "updates");
    const snapshot = await getDocs(updatesRef);
    
    const total = snapshot.size;
    document.getElementById('total-updates').textContent = total;
    
    let whatsNewCount = 0;
    let noticesCount = 0;
    let activeCount = 0;
    
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.type === 'whats_new') whatsNewCount++;
      if (data.type === 'notice') noticesCount++;
      if (data.isActive !== false) activeCount++;
    });
    
    document.getElementById('whats-new-count').textContent = whatsNewCount;
    document.getElementById('notices-count').textContent = noticesCount;
    document.getElementById('active-updates').textContent = activeCount;
    
    console.log("✅ Dashboard stats loaded");
    
  } catch (error) {
    console.error("❌ Error loading dashboard stats:", error);
  }
}

// ===== CREATE UPDATE FUNCTION =====
// THIS IS THE FUNCTION THAT'S MISSING!

async function createUpdate(updateData) {
  try {
    console.log("📝 Creating update:", updateData);
    
    // Validate required fields
    if (!updateData.type || !updateData.title || !updateData.preview) {
      return { success: false, error: "Missing required fields" };
    }
    
    const updatesRef = collection(db, "updates");
    const newUpdateRef = doc(updatesRef);
    
    await setDoc(newUpdateRef, {
      type: updateData.type,
      title: updateData.title,
      preview: updateData.preview,
      content: updateData.content || "",
      priority: updateData.priority || "normal",
      isActive: true,
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser?.uid || 'admin'
    });
    
    console.log("✅ Update created successfully, ID:", newUpdateRef.id);
    return { success: true, id: newUpdateRef.id };
    
  } catch (error) {
    console.error("❌ Error creating update:", error);
    return { success: false, error: error.message };
  }
}

// ===== OTHER FUNCTIONS =====

async function getAllUpdates() {
  try {
    const updatesRef = collection(db, "updates");
    const q = query(updatesRef, orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    
    const updates = [];
    snapshot.forEach(doc => {
      updates.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    return updates;
  } catch (error) {
    console.error("Error getting updates:", error);
    return [];
  }
}

async function toggleUpdateStatus(updateId, currentStatus) {
  try {
    const updateRef = doc(db, "updates", updateId);
    await updateDoc(updateRef, {
      isActive: !currentStatus,
      updatedAt: serverTimestamp()
    });
    
    return { success: true, newStatus: !currentStatus };
  } catch (error) {
    console.error("Error toggling status:", error);
    return { success: false, error: error.message };
  }
}

async function deleteUpdate(updateId) {
  try {
    if (!confirm("Are you sure you want to delete this update? This cannot be undone.")) {
      return { success: false, error: "Cancelled" };
    }
    
    const updateRef = doc(db, "updates", updateId);
    await deleteDoc(updateRef);
    
    return { success: true };
  } catch (error) {
    console.error("Error deleting update:", error);
    return { success: false, error: error.message };
  }
}

function formatDate(timestamp) {
  if (!timestamp) return "Unknown";
  try {
    const date = timestamp.toDate();
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  } catch (e) {
    return "Invalid date";
  }
}

// ===== CRITICAL: MAKE FUNCTIONS AVAILABLE GLOBALLY =====
// This makes them accessible from HTML files

window.loadDashboardStats = loadDashboardStats;
window.createUpdate = createUpdate;  // ← THIS IS WHAT'S MISSING!
window.getAllUpdates = getAllUpdates;
window.toggleUpdateStatus = toggleUpdateStatus;
window.deleteUpdate = deleteUpdate;
window.formatDate = formatDate;

// Also log to confirm
console.log("✅ Admin script.js loaded!");
console.log("📋 Available functions:", {
  loadDashboardStats: typeof loadDashboardStats,
  createUpdate: typeof createUpdate,  // Should be "function"
  getAllUpdates: typeof getAllUpdates,
  toggleUpdateStatus: typeof toggleUpdateStatus,
  deleteUpdate: typeof deleteUpdate,
  formatDate: typeof formatDate
});