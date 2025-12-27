// ============================================
// JOYIN Service Worker - FIXED OFFLINE SUPPORT
// Version 1.0.1
// ============================================

const CACHE_NAME = 'joyin-v1.0.0';
const OFFLINE_URL = '/offline.html';

// Essential files to cache immediately
const PRECACHE_URLS = [
  '/',
  '/offline.html',  // ← CRITICAL: Must be cached!
  '/admin-manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// ============================================
// INSTALL - Cache offline page FIRST
// ============================================
self.addEventListener('install', (event) => {
  console.log('🔧 [SW] Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('📦 [SW] Caching offline page and essentials');
        // Cache offline.html FIRST before anything else
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => {
        console.log('✅ [SW] Offline page cached successfully');
        return self.skipWaiting(); // Activate immediately
      })
      .catch((error) => {
        console.error('❌ [SW] Failed to cache offline page:', error);
      })
  );
});

// ============================================
// ACTIVATE - Take control immediately
// ============================================
self.addEventListener('activate', (event) => {
  console.log('🚀 [SW] Activating...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('🗑️ [SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('✅ [SW] Activation complete');
        return self.clients.claim(); // Take control of all pages
      })
  );
});

// ============================================
// FETCH - Handle requests with offline fallback
// ============================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip cross-origin requests (except CDN)
  if (url.origin !== location.origin && !url.href.includes('cdnjs.cloudflare.com')) {
    return;
  }
  
  // Skip Firebase/API requests - let them fail naturally
  if (url.pathname.includes('firestore') || 
      url.pathname.includes('firebase') ||
      url.pathname.includes('googleapis') ||
      url.hostname.includes('gstatic.com')) {
    return;
  }
  
  // ============================================
  // NAVIGATION REQUESTS (HTML Pages)
  // ============================================
  if (request.mode === 'navigate') {
    event.respondWith(
      // Try network first
      fetch(request)
        .then((response) => {
          // If successful, cache the page
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch((error) => {
          // Network failed - user is offline
          console.log('🔴 [SW] Network failed, showing offline page');
          
          // Try to serve cached version first
          return caches.match(request)
            .then((cachedResponse) => {
              if (cachedResponse) {
                console.log('✅ [SW] Serving cached page:', request.url);
                return cachedResponse;
              }
              
              // No cached version - show offline page
              console.log('📄 [SW] Serving offline.html');
              return caches.match(OFFLINE_URL)
                .then((offlinePage) => {
                  if (offlinePage) {
                    return offlinePage;
                  }
                  
                  // Fallback if offline.html not cached (shouldn't happen)
                  console.error('❌ [SW] offline.html not in cache!');
                  return createFallbackResponse();
                });
            });
        })
    );
    return;
  }
  
  // ============================================
  // OTHER REQUESTS (CSS, JS, Images, etc.)
  // ============================================
  event.respondWith(
    // Try cache first for speed
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          // Return cached version immediately
          return cachedResponse;
        }
        
        // Not in cache - fetch from network
        return fetch(request)
          .then((response) => {
            // Cache successful responses
            if (response.ok && request.url.startsWith('http')) {
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, responseClone);
              });
            }
            return response;
          })
          .catch((error) => {
            console.log('🔴 [SW] Failed to fetch:', request.url);
            
            // For images, return placeholder
            if (request.destination === 'image') {
              return createPlaceholderImage();
            }
            
            // For other resources, just fail
            throw error;
          });
      })
  );
});

// ============================================
// CREATE FALLBACK HTML (if offline.html missing)
// ============================================
function createFallbackResponse() {
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Offline - JOYIN</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          background: #000;
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          margin: 0;
          text-align: center;
          padding: 20px;
        }
        .container {
          max-width: 400px;
        }
        h1 {
          color: #5b53f2;
          margin-bottom: 16px;
        }
        p {
          color: rgba(255,255,255,0.7);
          line-height: 1.6;
          margin-bottom: 24px;
        }
        button {
          background: #5b53f2;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 16px;
          font-weight: 600;
        }
        button:hover {
          background: #4a43d1;
        }
        .icon {
          font-size: 64px;
          margin-bottom: 24px;
          opacity: 0.5;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">📡</div>
        <h1>You're Offline</h1>
        <p>No internet connection found. Check your connection and try again.</p>
        <button onclick="location.reload()">Try Again</button>
      </div>
      
      <script>
        // Auto-reload when back online
        window.addEventListener('online', () => {
          location.reload();
        });
      </script>
    </body>
    </html>
  `;
  
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html',
      'Cache-Control': 'no-cache'
    }
  });
}

// ============================================
// CREATE PLACEHOLDER IMAGE
// ============================================
function createPlaceholderImage() {
  // SVG placeholder with JOYIN branding
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
      <rect fill="#000000" width="400" height="400"/>
      <text x="50%" y="45%" dominant-baseline="middle" text-anchor="middle" 
            font-family="Arial Black" font-size="80" font-weight="900" fill="#5b53f2">J</text>
      <text x="50%" y="60%" dominant-baseline="middle" text-anchor="middle" 
            font-family="Arial" font-size="16" fill="rgba(255,255,255,0.5)">Offline</text>
    </svg>
  `;
  
  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'no-cache'
    }
  });
}

// ============================================
// MESSAGE EVENT - For cache updates
// ============================================
self.addEventListener('message', (event) => {
  console.log('💬 [SW] Message received:', event.data);
  
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      })
    );
  }
  
  if (event.data.type === 'CACHE_URLS') {
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.addAll(event.data.urls);
      })
    );
  }
});

console.log('✅ [SW] Service Worker loaded successfully');