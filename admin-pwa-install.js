// ============================================
// JOYIN PWA - AUTO-UPDATE VERSION
// ============================================

let deferredPrompt;
let installButton;
let swRegistration;

// ============================================
// CHECK IF INSTALLED
// ============================================
function isAppInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches ||
         window.navigator.standalone === true ||
         document.referrer.includes('android-app://');
}

// ============================================
// SERVICE WORKER - AUTO-UPDATE
// ============================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/admin-sw.js')
      .then((registration) => {
        console.log('✅ [PWA] Service Worker registered');
        swRegistration = registration;
        
        // Check for updates every 5 minutes
        setInterval(() => {
          console.log('🔄 [PWA] Checking for updates...');
          registration.update();
        }, 300000);
        
        // Listen for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          console.log('🆕 [PWA] New version detected!');
          
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New version ready - show update prompt
              showUpdatePrompt();
            }
          });
        });
      })
      .catch((error) => {
        console.error('❌ [PWA] Service Worker failed:', error);
      });
    
    // Listen for messages from service worker
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data.type === 'SW_UPDATED') {
        console.log(`🎉 [PWA] Updated to ${event.data.version}`);
        showUpdateSuccessMessage(event.data.version);
      }
    });
  });
}

// ============================================
// SHOW UPDATE PROMPT
// ============================================
function showUpdatePrompt() {
  const updateBanner = document.createElement('div');
  updateBanner.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px;">
      <div style="display: flex; align-items: center; gap: 12px;">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="23 4 23 10 17 10"></polyline>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
        </svg>
        <div>
          <strong>New version available!</strong>
          <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.9;">Reload to get the latest features</p>
        </div>
      </div>
      <button id="reload-btn" style="
        background: white;
        color: #5b53f2;
        border: none;
        padding: 8px 16px;
        border-radius: 6px;
        font-weight: 600;
        cursor: pointer;
        font-size: 14px;
      ">
        Reload
      </button>
    </div>
  `;
  updateBanner.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #5b53f2;
    color: white;
    padding: 16px 20px;
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(91, 83, 242, 0.5);
    z-index: 10000;
    animation: slideInDown 0.5s ease;
    max-width: 90%;
    width: 400px;
  `;
  
  document.body.appendChild(updateBanner);
  
  // Reload when clicked
  document.getElementById('reload-btn').addEventListener('click', () => {
    window.location.reload();
  });
  
  // Auto-reload after 30 seconds
  setTimeout(() => {
    window.location.reload();
  }, 30000);
}

// ============================================
// UPDATE SUCCESS MESSAGE
// ============================================
function showUpdateSuccessMessage(version) {
  const successMsg = document.createElement('div');
  successMsg.innerHTML = `
    <div style="display: flex; align-items: center; gap: 12px;">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
      <div>
        <strong>Updated to ${version}</strong>
        <p style="margin: 4px 0 0 0; font-size: 13px;">You're on the latest version!</p>
      </div>
    </div>
  `;
  successMsg.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #10b981;
    color: white;
    padding: 16px 20px;
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
    z-index: 10000;
    animation: slideInDown 0.5s ease;
  `;
  
  document.body.appendChild(successMsg);
  
  setTimeout(() => {
    successMsg.style.animation = 'slideOutUp 0.5s ease';
    setTimeout(() => successMsg.remove(), 500);
  }, 5000);
}

// ============================================
// INSTALL BUTTON
// ============================================
function showInstallButton() {
  if (isAppInstalled()) {
    console.log('📱 [PWA] Already installed');
    return;
  }
  
  installButton = document.getElementById('pwa-install-button');
  
  if (!installButton) {
    installButton = document.createElement('button');
    installButton.id = 'pwa-install-button';
    installButton.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      <span>Install App</span>
    `;
    installButton.style.cssText = `
      position: fixed;
      bottom: 70px;
      right: 20px;
      background: #5b53f2;
      color: white;
      border: none;
      border-radius: 25px;
      padding: 12px 24px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 4px 12px rgba(91, 83, 242, 0.4);
      z-index: 9999;
      transition: all 0.3s ease;
      animation: slideInUp 0.5s ease;
    `;
    
    installButton.addEventListener('mouseenter', () => {
      installButton.style.transform = 'translateY(-2px)';
      installButton.style.boxShadow = '0 6px 16px rgba(91, 83, 242, 0.5)';
    });
    
    installButton.addEventListener('mouseleave', () => {
      installButton.style.transform = 'translateY(0)';
      installButton.style.boxShadow = '0 4px 12px rgba(91, 83, 242, 0.4)';
    });
    
    installButton.addEventListener('click', handleInstallClick);
    document.body.appendChild(installButton);
  }
  
  installButton.style.display = 'flex';
}

function hideInstallButton() {
  if (installButton) {
    installButton.style.animation = 'slideOutDown 0.5s ease';
    setTimeout(() => {
      installButton.remove();
      installButton = null;
    }, 500);
  }
}

async function handleInstallClick() {
  if (!deferredPrompt) return;
  
  installButton.style.opacity = '0.5';
  installButton.style.pointerEvents = 'none';
  
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  
  if (outcome === 'accepted') {
    console.log('✅ [PWA] Install accepted');
    hideInstallButton();
    showInstallSuccessMessage();
  } else {
    installButton.style.opacity = '1';
    installButton.style.pointerEvents = 'auto';
  }
  
  deferredPrompt = null;
}

function showInstallSuccessMessage() {
  const msg = document.createElement('div');
  msg.innerHTML = `
    <div style="display: flex; align-items: center; gap: 12px;">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
      <div>
        <strong>App installed!</strong>
        <p style="margin: 4px 0 0 0; font-size: 13px;">JOYIN is now on your home screen</p>
      </div>
    </div>
  `;
  msg.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #10b981;
    color: white;
    padding: 16px 20px;
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
    z-index: 10000;
    animation: slideInUp 0.5s ease;
  `;
  
  document.body.appendChild(msg);
  setTimeout(() => {
    msg.style.animation = 'slideOutDown 0.5s ease';
    setTimeout(() => msg.remove(), 500);
  }, 5000);
}

// ============================================
// EVENT LISTENERS
// ============================================
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (!isAppInstalled()) showInstallButton();
});

window.addEventListener('appinstalled', () => {
  console.log('🎉 [PWA] Installed');
  hideInstallButton();
  showInstallSuccessMessage();
  deferredPrompt = null;
});

window.addEventListener('load', () => {
  if (isAppInstalled()) {
    console.log('📱 [PWA] Running as installed app');
    document.body.classList.add('pwa-mode');
    hideInstallButton();
  }
});

// ============================================
// ONLINE/OFFLINE DETECTION
// ============================================
window.addEventListener('online', () => {
  console.log('🟢 [PWA] Back online');
  showConnectionStatus('online');
});

window.addEventListener('offline', () => {
  console.log('🔴 [PWA] Offline');
  showConnectionStatus('offline');
});

function showConnectionStatus(status) {
  const banner = document.createElement('div');
  banner.innerHTML = status === 'online' 
    ? '🟢 You are back online' 
    : '🔴 You are offline';
  
  banner.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: ${status === 'online' ? '#10b981' : '#ef4444'};
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    z-index: 10000;
    animation: slideInDown 0.5s ease;
  `;
  
  document.body.appendChild(banner);
  
  setTimeout(() => {
    banner.style.animation = 'slideOutUp 0.5s ease';
    setTimeout(() => banner.remove(), 500);
  }, 3000);
}

// ============================================
// ANIMATIONS
// ============================================
const style = document.createElement('style');
style.textContent = `
  @keyframes slideInUp {
    from { transform: translateY(100px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
  @keyframes slideOutDown {
    from { transform: translateY(0); opacity: 1; }
    to { transform: translateY(100px); opacity: 0; }
  }
  @keyframes slideInDown {
    from { transform: translateX(-50%) translateY(-100px); opacity: 0; }
    to { transform: translateX(-50%) translateY(0); opacity: 1; }
  }
  @keyframes slideOutUp {
    from { transform: translateX(-50%) translateY(0); opacity: 1; }
    to { transform: translateX(-50%) translateY(-100px); opacity: 0; }
  }
`;
document.head.appendChild(style);