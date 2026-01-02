/* 
 * JOYIN ADMIN VIDEO PANEL - JAVASCRIPT
 * Manage video posts, view statistics, delete videos
 * (c) 2025 JOYIN
 */

import { auth, db, storage } from "../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { collection, query, getDocs, deleteDoc, doc, orderBy, where } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { ref, deleteObject } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-storage.js";

// ============================================
// GLOBAL VARIABLES
// ============================================

let currentUser = null;
let allVideos = [];                 // All loaded videos
let filteredVideos = [];            // Filtered videos (for search/filter)
let currentFilter = 'all';          // Current active filter
let selectedVideoData = null;       // Currently selected video for deletion

// DOM Elements
const loadingContainer = document.getElementById('loadingContainer');
const videoList = document.getElementById('videoList');
const noVideosMessage = document.getElementById('noVideosMessage');
const searchInput = document.getElementById('searchInput');
const filterButtons = document.querySelectorAll('.filter-btn');
const refreshBtn = document.getElementById('refreshBtn');
const backBtn = document.getElementById('backBtn');

// Modal Elements
const previewModal = document.getElementById('previewModal');
const confirmModal = document.getElementById('confirmModal');
const closeModal = document.getElementById('closeModal');
const cancelBtn = document.getElementById('cancelBtn');
const deleteVideoBtn = document.getElementById('deleteVideoBtn');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
const confirmCancelBtn = document.getElementById('confirmCancelBtn');
const modalVideo = document.getElementById('modalVideo');

// ============================================
// AUTHENTICATION & ADMIN CHECK
// ============================================

onAuthStateChanged(auth, async (user) => {
    if (user) {
        console.log("✅ User authenticated:", user.uid);
        currentUser = user;
        
        // Check if user is admin
        // const isAdmin = await checkAdminStatus(user.uid);
        
        // if (!isAdmin) {
        //     console.log("❌ User is not admin, redirecting...");
        //     alert("Access Denied: Admin privileges required");
        //     window.location.href = "../dashboard/";
        //     return;
        // }
        
        console.log("✅ Admin access granted");
        
        // Load videos
        await loadAllVideos();
        
    } else {
        console.log("❌ No user logged in, redirecting...");
        window.location.href = "../login/?view=login";
    }
});

// ============================================
// CHECK ADMIN STATUS
// ============================================
// Verify user has admin privileges

// async function checkAdminStatus(uid) {
//     try {
//         // Check if admin document exists
//         const adminDoc = await getDocs(query(collection(db, "admins"), where("userId", "==", uid)));
        
//         if (!adminDoc.empty) {
//             console.log("✅ Admin verified via Firestore");
//             return true;
//         }
        
//         // Alternative: Check custom claims (if you use them)
//         const tokenResult = await auth.currentUser.getIdTokenResult();
//         if (tokenResult.claims.admin === true) {
//             console.log("✅ Admin verified via custom claims");
//             return true;
//         }
        
//         return false;
        
//     } catch (error) {
//         console.error("❌ Error checking admin status:", error);
//         return false;
//     }
// }

// ============================================
// LOAD ALL VIDEOS
// ============================================
// Fetch all video posts from Firestore

async function loadAllVideos() {
    try {
        console.log("📥 Loading all videos...");
        showLoading();
        
        // Query all video-posts, ordered by newest first
        const videosQuery = query(
            collection(db, "video-posts"),
            orderBy("createdAt", "desc")
        );
        
        const snapshot = await getDocs(videosQuery);
        
        console.log(`✅ Loaded ${snapshot.docs.length} videos`);
        
        // Store all videos
        allVideos = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        // Calculate and display statistics
        calculateStatistics();
        
        // Display videos
        filteredVideos = [...allVideos];
        displayVideos(filteredVideos);
        
        hideLoading();
        
    } catch (error) {
        console.error("❌ Error loading videos:", error);
        hideLoading();
        showError("Failed to load videos");
    }
}

// ============================================
// CALCULATE STATISTICS
// ============================================
// Calculate total, today, week, and storage stats

function calculateStatistics() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    let todayCount = 0;
    let weekCount = 0;
    let totalStorage = 0;
    
    allVideos.forEach(video => {
        // Convert Firestore timestamp to Date
        const createdAt = video.createdAt?.toDate ? video.createdAt.toDate() : new Date(video.createdAt);
        
        // Count today's videos
        if (createdAt >= todayStart) {
            todayCount++;
        }
        
        // Count this week's videos
        if (createdAt >= weekStart) {
            weekCount++;
        }
        
        // Calculate total storage
        if (video.fileSize) {
            totalStorage += video.fileSize;
        }
    });
    
    // Update statistics display
    document.getElementById('totalVideos').textContent = allVideos.length;
    document.getElementById('todayVideos').textContent = todayCount;
    document.getElementById('weekVideos').textContent = weekCount;
    document.getElementById('storageUsed').textContent = formatFileSize(totalStorage);
    
    console.log(`📊 Statistics: Total: ${allVideos.length}, Today: ${todayCount}, Week: ${weekCount}, Storage: ${formatFileSize(totalStorage)}`);
}

// ============================================
// DISPLAY VIDEOS
// ============================================
// Render video cards to the page

function displayVideos(videos) {
    // Clear container
    videoList.innerHTML = '';
    
    // Check if videos exist
    if (videos.length === 0) {
        noVideosMessage.style.display = 'block';
        return;
    }
    
    noVideosMessage.style.display = 'none';
    
    // Create video cards
    videos.forEach(video => {
        const videoCard = createVideoCard(video);
        videoList.appendChild(videoCard);
    });
    
    console.log(`📺 Displayed ${videos.length} videos`);
}

// ============================================
// CREATE VIDEO CARD
// ============================================
// Build HTML for a single video card

function createVideoCard(video) {
    const card = document.createElement('div');
    card.className = 'video-card';
    card.dataset.videoId = video.id;
    
    // Format date
    const createdAt = video.createdAt?.toDate ? video.createdAt.toDate() : new Date(video.createdAt);
    const dateStr = formatDate(createdAt);
    
    // Build HTML
    card.innerHTML = `
        <div class="video-thumbnail">
            <video preload="metadata" muted>
                <source src="${video.videoUrl}#t=0.5" type="video/mp4">
            </video>
            <div class="play-overlay">
                <i class="fas fa-play"></i>
            </div>
        </div>
        
        <div class="video-card-info">
            <div class="video-card-header">
                <img 
                    src="${video.userProfilePic || 'https://tse1.mm.bing.net/th/id/OIP.cEvbluCvNFD_k4wC3k-_UwHaHa?rs=1&pid=ImgDetMain&o=7&rm=3'}" 
                    alt="User avatar" 
                    class="user-avatar"
                >
                <div class="user-info">
                    <div class="username">@${video.username || 'User'}</div>
                    <div class="upload-date">${dateStr}</div>
                </div>
            </div>
            
            ${video.text ? `<div class="video-caption">${escapeHtml(video.text)}</div>` : ''}
            
            <div class="video-stats">
                <div class="stat-item">
                    <i class="fas fa-heart"></i>
                    <span>${formatCount(video.likeCount || 0)}</span>
                </div>
                <div class="stat-item">
                    <i class="fas fa-comment"></i>
                    <span>${formatCount(video.commentCount || 0)}</span>
                </div>
                <div class="stat-item">
                    <i class="fas fa-clock"></i>
                    <span>${video.duration || 0}s</span>
                </div>
                <div class="stat-item">
                    <i class="fas fa-file"></i>
                    <span>${formatFileSize(video.fileSize || 0)}</span>
                </div>
            </div>
        </div>
    `;
    
    // Add click handler to open preview modal
    card.addEventListener('click', () => {
        openPreviewModal(video);
    });
    
    return card;
}

// ============================================
// OPEN PREVIEW MODAL
// ============================================
// Show video preview with details

function openPreviewModal(video) {
    selectedVideoData = video;
    
    // Set video source
    modalVideo.src = video.videoUrl;
    
    // Fill in details
    document.getElementById('modalUsername').textContent = `@${video.username || 'User'}`;
    document.getElementById('modalVideoId').textContent = video.id;
    
    // Format date
    const createdAt = video.createdAt?.toDate ? video.createdAt.toDate() : new Date(video.createdAt);
    document.getElementById('modalDate').textContent = formatFullDate(createdAt);
    
    document.getElementById('modalDuration').textContent = `${video.duration || 0} seconds`;
    document.getElementById('modalSize').textContent = formatFileSize(video.fileSize || 0);
    document.getElementById('modalLikes').textContent = formatCount(video.likeCount || 0);
    document.getElementById('modalComments').textContent = formatCount(video.commentCount || 0);
    
    // Show/hide caption
    const captionRow = document.getElementById('captionRow');
    if (video.text && video.text.trim() !== '') {
        captionRow.style.display = 'flex';
        document.getElementById('modalCaption').textContent = video.text;
    } else {
        captionRow.style.display = 'none';
    }
    
    // Show modal
    previewModal.classList.add('active');
    
    console.log("👁️ Opened preview for video:", video.id);
}

// ============================================
// CLOSE PREVIEW MODAL
// ============================================

function closePreviewModal() {
    previewModal.classList.remove('active');
    modalVideo.pause();
    modalVideo.src = '';
    selectedVideoData = null;
}

// ============================================
// DELETE VIDEO
// ============================================
// Delete video from Firestore AND Firebase Storage

async function deleteVideo(video) {
    try {
        console.log("🗑️ Deleting video:", video.id);
        
        // STEP 1: Delete from Firestore
        await deleteDoc(doc(db, "video-posts", video.id));
        console.log("✅ Deleted from Firestore");
        
        // STEP 2: Delete from Storage
        // Extract storage path from video URL
        const storagePath = extractStoragePath(video.videoUrl);
        
        if (storagePath) {
            try {
                const storageRef = ref(storage, storagePath);
                await deleteObject(storageRef);
                console.log("✅ Deleted from Storage:", storagePath);
            } catch (storageError) {
                console.error("⚠️ Error deleting from Storage:", storageError);
                // Continue even if storage deletion fails
            }
        } else {
            console.log("⚠️ Could not extract storage path from URL");
        }
        
        // STEP 3: Remove from local arrays
        allVideos = allVideos.filter(v => v.id !== video.id);
        filteredVideos = filteredVideos.filter(v => v.id !== video.id);
        
        // STEP 4: Update UI
        calculateStatistics();
        displayVideos(filteredVideos);
        
        // STEP 5: Close modals
        closePreviewModal();
        closeConfirmModal();
        
        // STEP 6: Show success message
        showSuccessMessage("Video deleted successfully!");
        
        console.log("✅ Video deletion complete");
        
    } catch (error) {
        console.error("❌ Error deleting video:", error);
        alert(`Failed to delete video: ${error.message}`);
    }
}

// ============================================
// EXTRACT STORAGE PATH FROM URL
// ============================================
// Convert Firebase Storage URL to storage path

function extractStoragePath(url) {
    try {
        // Firebase Storage URL format:
        // https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{path}?alt=media&token={token}
        
        // Extract the path between /o/ and ?alt=
        const matches = url.match(/\/o\/(.+?)\?alt=/);
        
        if (matches && matches[1]) {
            // Decode URL-encoded path
            const decodedPath = decodeURIComponent(matches[1]);
            console.log("📂 Extracted storage path:", decodedPath);
            return decodedPath;
        }
        
        return null;
        
    } catch (error) {
        console.error("❌ Error extracting storage path:", error);
        return null;
    }
}

// ============================================
// FILTER VIDEOS
// ============================================
// Filter by time period (all, today, week)

function filterVideos(filterType) {
    currentFilter = filterType;
    
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    if (filterType === 'all') {
        filteredVideos = [...allVideos];
    } else if (filterType === 'today') {
        filteredVideos = allVideos.filter(video => {
            const createdAt = video.createdAt?.toDate ? video.createdAt.toDate() : new Date(video.createdAt);
            return createdAt >= todayStart;
        });
    } else if (filterType === 'week') {
        filteredVideos = allVideos.filter(video => {
            const createdAt = video.createdAt?.toDate ? video.createdAt.toDate() : new Date(video.createdAt);
            return createdAt >= weekStart;
        });
    }
    
    // Apply search if there's a search term
    const searchTerm = searchInput.value.trim();
    if (searchTerm !== '') {
        searchVideos(searchTerm);
    } else {
        displayVideos(filteredVideos);
    }
    
    console.log(`🔍 Filtered to ${filteredVideos.length} videos (${filterType})`);
}

// ============================================
// SEARCH VIDEOS
// ============================================
// Search by username or video ID

function searchVideos(searchTerm) {
    const term = searchTerm.toLowerCase();
    
    filteredVideos = filteredVideos.filter(video => {
        const username = (video.username || '').toLowerCase();
        const videoId = video.id.toLowerCase();
        const caption = (video.text || '').toLowerCase();
        
        return username.includes(term) || 
               videoId.includes(term) || 
               caption.includes(term);
    });
    
    displayVideos(filteredVideos);
    
    console.log(`🔍 Search results: ${filteredVideos.length} videos`);
}

// ============================================
// EVENT LISTENERS
// ============================================

// Back button
backBtn.addEventListener('click', () => {
    window.history.back();
});

// Refresh button
refreshBtn.addEventListener('click', async () => {
    refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
    refreshBtn.disabled = true;
    
    await loadAllVideos();
    
    refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
    refreshBtn.disabled = false;
});

// Filter buttons
filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        // Update active state
        filterButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Apply filter
        const filterType = btn.dataset.filter;
        filterVideos(filterType);
    });
});

// Search input
let searchTimeout;
searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    
    searchTimeout = setTimeout(() => {
        // Re-filter based on current filter
        filterVideos(currentFilter);
    }, 300);
});

// Modal close buttons
closeModal.addEventListener('click', closePreviewModal);
cancelBtn.addEventListener('click', closePreviewModal);

// Click outside modal to close
previewModal.addEventListener('click', (e) => {
    if (e.target === previewModal) {
        closePreviewModal();
    }
});

confirmModal.addEventListener('click', (e) => {
    if (e.target === confirmModal) {
        closeConfirmModal();
    }
});

// Delete button - open confirmation
deleteVideoBtn.addEventListener('click', () => {
    if (selectedVideoData) {
        confirmModal.classList.add('active');
    }
});

// Confirm delete
confirmDeleteBtn.addEventListener('click', () => {
    if (selectedVideoData) {
        deleteVideo(selectedVideoData);
    }
});

// Cancel delete
confirmCancelBtn.addEventListener('click', closeConfirmModal);

function closeConfirmModal() {
    confirmModal.classList.remove('active');
}

// ============================================
// HELPER FUNCTIONS
// ============================================

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    
    const units = ['B', 'KB', 'MB', 'GB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + units[i];
}

// Format count (1000 -> 1K)
function formatCount(count) {
    if (count >= 1000000) {
        return (count / 1000000).toFixed(1) + 'M';
    }
    if (count >= 1000) {
        return (count / 1000).toFixed(1) + 'K';
    }
    return count.toString();
}

// Format date (short)
function formatDate(date) {
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 7) {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } else if (days > 0) {
        return `${days}d ago`;
    } else if (hours > 0) {
        return `${hours}h ago`;
    } else if (minutes > 0) {
        return `${minutes}m ago`;
    } else {
        return 'Just now';
    }
}

// Format date (full)
function formatFullDate(date) {
    return date.toLocaleDateString('en-US', { 
        month: 'long', 
        day: 'numeric', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Show loading
function showLoading() {
    loadingContainer.style.display = 'block';
    videoList.style.display = 'none';
    noVideosMessage.style.display = 'none';
}

// Hide loading
function hideLoading() {
    loadingContainer.style.display = 'none';
    videoList.style.display = 'grid';
}

// Show error
function showError(message) {
    alert(`❌ ${message}`);
}

// Show success message
function showSuccessMessage(message) {
    // Create temporary success toast
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #2ed573;
        color: white;
        padding: 15px 24px;
        border-radius: 8px;
        font-weight: 600;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        animation: slideIn 0.3s ease;
    `;
    toast.textContent = `✅ ${message}`;
    
    document.body.appendChild(toast);
    
    // Remove after 3 seconds
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Add animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

console.log("✅ Admin Video Panel loaded!");