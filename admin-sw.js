// ============================================
// JOYIN ADMIN SERVICE WORKER
// Version 1.0.0
// ============================================

const CACHE_NAME = 'joyin-admin-v1.0.0';

// Essential admin files to cache
const PRECACHE_URLS = [
  // '/admin/',
  '/index.html',
  '/dashboard.html',
  // '/admin/css/admin.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// ============================================
// INSTALL
// ============================================
self.addEventListener('install', (event) => {
  console.log('[Admin SW] Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Admin SW] Caching admin files');
        return cache.addAll(PRECACHE_URLS).catch(err => {
          console.error('[Admin SW] Cache failed:', err);
        });
      })
      .then(() => self.skipWaiting())
  );
});

// ============================================
// ACTIVATE
// ============================================
self.addEventListener('activate', (event) => {
  console.log('[Admin SW] Activating...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME && cacheName.includes('joyin-admin')) {
              console.log('[Admin SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// ============================================
// FETCH - Network first for admin
// ============================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip Firebase/API calls
  if (request.url.includes('firebase') || 
      request.url.includes('googleapis') ||
      request.url.includes('/api/')) {
    return;
  }
  
  // Network first strategy for admin pages
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful responses
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // If network fails, try cache
        return caches.match(request);
      })
  );
});

console.log('[Admin SW] Service Worker loaded');