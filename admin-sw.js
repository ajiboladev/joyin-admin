// ============================================
// JOYIN Service Worker - AUTO-UPDATE VERSION
// UPDATES DEPLOY INSTANTLY WITHOUT CLEARING CACHE
// ============================================

const CACHE_VERSION = "v1.0.0"; // 👈 INCREMENT THIS FOR EACH UPDATE
const CACHE_NAME = `joyin-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline.html";

// Essential files to cache
const PRECACHE_URLS = [
  "/",
  "/dashboard.html",
  "/login.html",
  "/posts.html",
  "/offline.html",
  "/manifest.json",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css",
];

// ============================================
// INSTALL - Cache essentials
// ============================================
self.addEventListener("install", (event) => {
  console.log(`🔧 [SW ${CACHE_VERSION}] Installing...`);

  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.log(`📦 [SW ${CACHE_VERSION}] Caching essentials`);
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => {
        console.log(`✅ [SW ${CACHE_VERSION}] Installation complete`);
        return self.skipWaiting(); // Activate new SW immediately
      })
      .catch((error) => {
        console.error(`❌ [SW ${CACHE_VERSION}] Installation failed:`, error);
      }),
  );
});

// ============================================
// ACTIVATE - Delete old caches immediately
// ============================================
self.addEventListener("activate", (event) => {
  console.log(`🚀 [SW ${CACHE_VERSION}] Activating...`);

  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log(`🗑️ [SW] Deleting old cache: ${cacheName}`);
              return caches.delete(cacheName);
            }
          }),
        );
      })
      .then(() => {
        console.log(`✅ [SW ${CACHE_VERSION}] Activated, old caches cleared`);
        return self.clients.claim(); // Take control immediately
      })
      .then(() => {
        // Notify all clients to reload
        return self.clients.matchAll().then((clients) => {
          clients.forEach((client) => {
            client.postMessage({
              type: "SW_UPDATED",
              version: CACHE_VERSION,
            });
          });
        });
      }),
  );
});

// ============================================
// FETCH - NETWORK-FIRST for HTML/JS/CSS
// ============================================
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== "GET") return;

  // Skip cross-origin (except CDN)
  if (
    url.origin !== location.origin &&
    !url.href.includes("cdnjs.cloudflare.com")
  ) {
    return;
  }

  // Skip Firebase/API
  if (
    url.pathname.includes("firestore") ||
    url.pathname.includes("firebase") ||
    url.pathname.includes("googleapis") ||
    url.hostname.includes("gstatic.com")
  ) {
    return;
  }

  // ============================================
  // NETWORK-FIRST for HTML/JS/CSS (always fresh)
  // ============================================
  if (
    request.mode === "navigate" ||
    request.destination === "script" ||
    request.destination === "style"
  ) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Always update cache with fresh content
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Only use cache if network fails
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              console.log(`📦 [SW] Serving cached (offline): ${request.url}`);
              return cachedResponse;
            }

            // Show offline page
            if (request.mode === "navigate") {
              return caches.match(OFFLINE_URL) || createFallbackResponse();
            }

            throw new Error("No cache available");
          });
        }),
    );
    return;
  }

  // ============================================
  // CACHE-FIRST for images/fonts (they don't change)
  // ============================================
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request)
        .then((response) => {
          if (response.ok && request.url.startsWith("http")) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          if (request.destination === "image") {
            return createPlaceholderImage();
          }
          throw new Error("Fetch failed");
        });
    }),
  );
});

// ============================================
// FALLBACK HTML
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
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
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
        .container { max-width: 400px; }
        h1 { color: #5b53f2; margin-bottom: 16px; }
        p { color: rgba(255,255,255,0.7); line-height: 1.6; margin-bottom: 24px; }
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
        .icon { font-size: 64px; margin-bottom: 24px; opacity: 0.5; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">📡</div>
        <h1>You're Offline</h1>
        <p>No internet connection. Check your connection and try again.</p>
        <button onclick="location.reload()">Try Again</button>
      </div>
      <script>
        window.addEventListener('online', () => location.reload());
      </script>
    </body>
    </html>
  `;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html",
      "Cache-Control": "no-cache",
    },
  });
}

// ============================================
// PLACEHOLDER IMAGE
// ============================================
function createPlaceholderImage() {
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
      "Content-Type": "image/svg+xml",
      "Cache-Control": "no-cache",
    },
  });
}

// ============================================
// MESSAGE HANDLER
// ============================================
self.addEventListener("message", (event) => {
  console.log("💬 [SW] Message:", event.data);

  if (event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  if (event.data.type === "CLEAR_CACHE") {
    event.waitUntil(
      caches.keys().then((names) => {
        return Promise.all(names.map((name) => caches.delete(name)));
      }),
    );
  }
});

console.log(`✅ [SW ${CACHE_VERSION}] Loaded successfully`);
