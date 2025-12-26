/* 
 *  JOYIN - Feedback Admin Panel
 *  Administrator interface for managing feedback
 *  © 2025 JOYIN. All rights reserved.
 */

// Import Firebase
import { db } from "../js/firebase.js";
import { 
    collection, 
    getDocs, 
    query, 
    orderBy, 
    where,
    updateDoc,
    doc,
    Timestamp 
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

// DOM Elements
const feedbackListAdmin = document.getElementById('feedbackListAdmin');
const statsGrid = document.getElementById('statsGrid');
const totalCount = document.getElementById('totalCount');
const newCount = document.getElementById('newCount');
const repliedCount = document.getElementById('repliedCount');
const todayCount = document.getElementById('todayCount');
const searchInput = document.getElementById('searchInput');
const adminStatusMessage = document.getElementById('adminStatusMessage');
const filterButtons = document.querySelectorAll('.filter-btn');

// Global state
let allFeedback = [];
let filteredFeedback = [];
let currentFilter = 'all';
let searchTerm = '';

// EmailJS Configuration - USE YOUR ACTUAL KEYS HERE
const EMAILJS_CONFIG = {
    SERVICE_ID: 'service_9dxiql5',     // Your Service ID
    TEMPLATE_ID: 'template_5xwafse',   // Your Template ID
    PUBLIC_KEY: 'xmxuALwYxF0x0_FKk'    // Your Public Key
};

// Initialize
async function init() {
    console.log('🛡️ Admin panel initializing...');
    
    // Check admin access (you should add proper authentication here)
    // For now, we'll just load the data
    
    // Setup event listeners
    setupEventListeners();
    
    // Load initial data
    await loadFeedback();
    
    // Auto-refresh every 30 seconds
    setInterval(loadFeedback, 30000);
}

// Setup event listeners
function setupEventListeners() {
    // Filter buttons
    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            filterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            filterFeedback();
        });
    });
    
    // Search input
    searchInput.addEventListener('input', (e) => {
        searchTerm = e.target.value.toLowerCase();
        filterFeedback();
    });
}

// Load all feedback from Firestore
async function loadFeedback() {
    try {
        feedbackListAdmin.innerHTML = `
            <div class="loading-admin">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Loading feedback...</p>
            </div>
        `;
        
        const q = query(
            collection(db, 'feedback'),
            orderBy('createdAt', 'desc')
        );
        
        const snapshot = await getDocs(q);
        allFeedback = [];
        
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            allFeedback.push({
                id: docSnap.id,
                ...data,
                // Convert Firestore timestamp to Date
                createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
                updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date()
            });
        });
        
        updateStats();
        filterFeedback();
        
    } catch (error) {
        console.error('Error loading feedback:', error);
        feedbackListAdmin.innerHTML = `
            <div class="no-feedback-admin">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Error Loading Feedback</h3>
                <p>${error.message}</p>
                <button onclick="location.reload()" style="margin-top: 15px; padding: 10px 20px; background: var(--joyin-accent); color: white; border: none; border-radius: 8px; cursor: pointer;">
                    Retry
                </button>
            </div>
        `;
    }
}

// Update statistics
function updateStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const stats = {
        total: allFeedback.length,
        new: allFeedback.filter(f => f.status === 'new').length,
        replied: allFeedback.filter(f => f.status === 'replied').length,
        today: allFeedback.filter(f => {
            const feedbackDate = f.createdAt;
            return feedbackDate >= today;
        }).length
    };
    
    totalCount.textContent = stats.total;
    newCount.textContent = stats.new;
    repliedCount.textContent = stats.replied;
    todayCount.textContent = stats.today;
}

// Filter feedback based on current filter and search
function filterFeedback() {
    filteredFeedback = allFeedback.filter(feedback => {
        // Apply search filter
        if (searchTerm) {
            const searchInMessage = feedback.message.toLowerCase().includes(searchTerm);
            const searchInEmail = feedback.userEmail.toLowerCase().includes(searchTerm);
            const searchInName = (feedback.userName || '').toLowerCase().includes(searchTerm);
            
            if (!searchInMessage && !searchInEmail && !searchInName) {
                return false;
            }
        }
        
        // Apply type filter
        switch (currentFilter) {
            case 'all':
                return true;
            case 'new':
                return feedback.status === 'new';
            case 'replied':
                return feedback.status === 'replied';
            case 'idea':
                return feedback.type === 'idea';
            case 'bug':
                return feedback.type === 'bug';
            default:
                return true;
        }
    });
    
    renderFeedback();
}

// Render feedback list
function renderFeedback() {
    if (filteredFeedback.length === 0) {
        feedbackListAdmin.innerHTML = `
            <div class="no-feedback-admin">
                <i class="fas fa-inbox"></i>
                <h3>No Feedback Found</h3>
                <p>${searchTerm ? 'Try a different search term' : 'No feedback matches your current filter'}</p>
            </div>
        `;
        return;
    }
    
    feedbackListAdmin.innerHTML = '';
    
    filteredFeedback.forEach(feedback => {
        const feedbackItem = createFeedbackItemAdmin(feedback);
        feedbackListAdmin.appendChild(feedbackItem);
    });
}

// Create admin feedback item
function createFeedbackItemAdmin(feedback) {
    const div = document.createElement('div');
    div.className = `feedback-item-admin ${feedback.status}`;
    div.id = `feedback-${feedback.id}`;
    
    // Format date
    const dateStr = feedback.createdAt.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    
    // Type label
    const typeLabels = {
        'idea': '💡 Idea',
        'bug': '🐛 Bug Report',
        'praise': '❤️ Praise',
        'other': '📝 Other'
    };
    
    // Status badge
    const statusLabels = {
        'new': 'New',
        'read': 'Read',
        'replied': 'Replied',
        'closed': 'Closed'
    };
    
    div.innerHTML = `
        <div class="feedback-header-admin">
            <div class="user-info-admin">
                <div class="user-avatar-admin">
                    ${feedback.userName ? feedback.userName.charAt(0).toUpperCase() : 'U'}
                </div>
                <div class="user-details-admin">
                    <h4>${feedback.userName || 'Anonymous User'}</h4>
                    <small>${feedback.userEmail}</small>
                    <br>
                    <small>User ID: ${feedback.userId.substring(0, 8)}...</small>
                </div>
            </div>
            <div class="feedback-meta-admin">
                <span class="feedback-type-admin">${typeLabels[feedback.type] || feedback.type}</span>
                <span class="feedback-date-admin">${dateStr}</span>
                <span class="status-badge status-${feedback.status}">${statusLabels[feedback.status] || feedback.status}</span>
            </div>
        </div>
        
        <div class="feedback-content-admin">${feedback.message}</div>
        
        ${feedback.allowReply === false ? 
            `<div style="color: var(--joyin-gray); font-size: 0.9rem; margin-bottom: 15px;">
                <i class="fas fa-envelope-slash"></i> User opted out of email replies
            </div>` : ''
        }
        
        ${feedback.adminReply ? 
            `<div class="reply-section">
                <h5><i class="fas fa-reply"></i> Your Reply</h5>
                <div class="admin-reply-content">${feedback.adminReply}</div>
                <small style="color: var(--joyin-gray); display: block; margin-top: 8px;">
                    Replied on: ${feedback.updatedAt.toLocaleDateString()}
                </small>
            </div>` : 
            `<div class="reply-section">
                <h5><i class="fas fa-reply"></i> Reply to User</h5>
                <div class="reply-form" id="reply-form-${feedback.id}">
                    <textarea class="reply-textarea" id="reply-text-${feedback.id}" 
                        placeholder="Type your reply here..."></textarea>
                    <div class="reply-actions">
                        <button class="cancel-btn" onclick="cancelReply('${feedback.id}')">
                            Cancel
                        </button>
                        <button class="reply-btn" onclick="sendReply('${feedback.id}')">
                            <i class="fas fa-paper-plane"></i>
                            Send Reply
                        </button>
                    </div>
                </div>
                <button class="filter-btn" onclick="showReplyForm('${feedback.id}')" 
                    style="margin-top: 10px;" ${feedback.allowReply === false ? 'disabled' : ''}>
                    <i class="fas fa-reply"></i>
                    ${feedback.allowReply === false ? 'User opted out' : 'Reply via Email'}
                </button>
            </div>`
        }
    `;
    
    return div;
}

// Show reply form
function showReplyForm(feedbackId) {
    const form = document.getElementById(`reply-form-${feedbackId}`);
    const allForms = document.querySelectorAll('.reply-form');
    
    // Hide all other forms
    allForms.forEach(f => f.classList.remove('active'));
    
    // Show this form
    form.classList.add('active');
    document.getElementById(`reply-text-${feedbackId}`).focus();
}

// Cancel reply
function cancelReply(feedbackId) {
    const form = document.getElementById(`reply-form-${feedbackId}`);
    const textarea = document.getElementById(`reply-text-${feedbackId}`);
    
    form.classList.remove('active');
    textarea.value = '';
}

// Send reply via EmailJS
async function sendReply(feedbackId) {
    const feedback = allFeedback.find(f => f.id === feedbackId);
    const textarea = document.getElementById(`reply-text-${feedbackId}`);
    const replyText = textarea.value.trim();
    
    if (!replyText) {
        showAdminStatus('Please write a reply message', 'error');
        return;
    }
    
    if (!feedback.allowReply) {
        showAdminStatus('User opted out of email replies', 'error');
        return;
    }
    
    // Show loading
    const replyBtn = document.querySelector(`#reply-form-${feedbackId} .reply-btn`);
    const originalText = replyBtn.innerHTML;
    replyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
    replyBtn.disabled = true;
    
    try {
        // Prepare email parameters
        const templateParams = {
            to_email: feedback.userEmail,
            user_name: feedback.userName,
            user_message: feedback.message,
            admin_reply: replyText,
            feedback_date: feedback.createdAt.toLocaleDateString(),
            subject: `Re: Your JOYIN Feedback`
        };
        
        // Send email via EmailJS
        await emailjs.send(
            EMAILJS_CONFIG.SERVICE_ID,
            EMAILJS_CONFIG.TEMPLATE_ID,
            templateParams,
            EMAILJS_CONFIG.PUBLIC_KEY
        );
        
        console.log('Email sent successfully via EmailJS');
        
        // Update feedback in Firestore
        const feedbackRef = doc(db, 'feedback', feedbackId);
        await updateDoc(feedbackRef, {
            status: 'replied',
            adminReply: replyText,
            repliedAt: Timestamp.now(),
            updatedAt: Timestamp.now()
        });
        
        // Show success
        showAdminStatus(`✅ Reply sent to ${feedback.userEmail}`, 'success');
        
        // Reload feedback to show updated status
        await loadFeedback();
        
    } catch (error) {
        console.error('Error sending reply:', error);
        showAdminStatus(`❌ Failed to send reply: ${error.message}`, 'error');
        
        // Restore button
        replyBtn.innerHTML = originalText;
        replyBtn.disabled = false;
    }
}

// Show admin status message
function showAdminStatus(message, type = 'info') {
    adminStatusMessage.textContent = message;
    adminStatusMessage.className = `status-message ${type}`;
    adminStatusMessage.style.display = 'flex';
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        adminStatusMessage.style.display = 'none';
    }, 5000);
}

// Mark as read
async function markAsRead(feedbackId) {
    try {
        const feedbackRef = doc(db, 'feedback', feedbackId);
        await updateDoc(feedbackRef, {
            status: 'read',
            updatedAt: Timestamp.now()
        });
        
        showAdminStatus('✅ Marked as read', 'success');
        await loadFeedback();
        
    } catch (error) {
        console.error('Error marking as read:', error);
        showAdminStatus('❌ Failed to update status', 'error');
    }
}

// Make functions available globally
window.showReplyForm = showReplyForm;
window.cancelReply = cancelReply;
window.sendReply = sendReply;
window.markAsRead = markAsRead;

// Initialize when page loads
document.addEventListener('DOMContentLoaded', init);