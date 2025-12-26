// admin/js/dashboard.js
import { auth, db } from './firebase.js';
import { checkAdminAuth } from './auth.js';
import { 
    collection, 
    getDocs, 
    query, 
    where, 
    orderBy,
    doc,
    getDoc 
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

// Get all stats
export async function getAdminStats() {
    const users = await getAllUsers();
    const posts = await getAllPosts();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // New users today
    const newUsersToday = users.filter(user => {
        const userDate = user.createdAt?.toDate ? user.createdAt.toDate() : new Date(user.createdAt);
        return userDate >= today;
    }).length;
    
    // Banned users
    const bannedUsers = users.filter(user => 
        user.softBan === true || user.softBan === "true"
    ).length;
    
    // Posts by date
    const postsByDate = {};
    posts.forEach(post => {
        const date = post.createdAt?.toDate ? 
            post.createdAt.toDate().toLocaleDateString() : 
            new Date(post.createdAt).toLocaleDateString();
        
        postsByDate[date] = (postsByDate[date] || 0) + 1;
    });
    
    return {
        totalUsers: users.length,
        totalPosts: posts.length,
        newUsersToday: newUsersToday,
        bannedUsers: bannedUsers,
        activeUsers: users.length - bannedUsers,
        postsByDate: postsByDate
    };
}

// Get all users
export async function getAllUsers() {
    const usersRef = collection(db, "users");
    const snapshot = await getDocs(usersRef);
    
    const users = [];
    snapshot.forEach((doc) => {
        users.push({
            id: doc.id,
            ...doc.data()
        });
    });
    
    return users;
}

// Get all posts
export async function getAllPosts() {
    const postsRef = collection(db, "posts");
    const q = query(postsRef, orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    
    const posts = [];
    snapshot.forEach((doc) => {
        posts.push({
            id: doc.id,
            ...doc.data()
        });
    });
    
    return posts;
}

// Search users
export async function searchUsers(searchTerm) {
    const users = await getAllUsers();
    return users.filter(user => 
        user.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.id?.includes(searchTerm)
    );
}