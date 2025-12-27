// ============================================
// JOYIN PWA Installation Script - FIXED
// ============================================

let deferredPrompt;
let installButton;

// ============================================
// CHECK IF ALREADY INSTALLED
// ============================================
function isAppInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches ||
         window.navigator.standalone === true ||
         document.referrer.includes('android-app://');
}

// ============================================
// SERVICE WORKER REGISTRATION
// ============================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/admin-sw.js')
      .then((registration) => {
        console.log('✅ [PWA] Service Worker registered');
        
        // Check for updates every hour
        setInterval(() => {
          registration.update();
        }, 3600000);
      })
      .catch((error) => {
        console.error('❌ [PWA] Service Worker registration failed:', error);
      });
  });
}

// ============================================
// SHOW INSTALL BUTTON
// ============================================
function showInstallButton() {
  // Don't show if already installed
  if (isAppInstalled()) {
    console.log('📱 [PWA] App already installed, hiding button');
    return;
  }
  
  // Check if button already exists
  installButton = document.getElementById('pwa-install-button');
  
  if (!installButton) {
    // Create install button
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
      bottom: 80px;
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
    
    // Hover effects
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

// ============================================
// HIDE INSTALL BUTTON PERMANENTLY
// ============================================
function hideInstallButton() {
  if (installButton) {
    installButton.style.animation = 'slideOutDown 0.5s ease';
    setTimeout(() => {
      installButton.remove();
      installButton = null;
    }, 500);
  }
}

// ============================================
// HANDLE INSTALL CLICK
// ============================================
async function handleInstallClick() {
  if (!deferredPrompt) {
    console.warn('⚠️ [PWA] Install prompt not available');
    return;
  }
  
  // Hide the button temporarily
  installButton.style.opacity = '0.5';
  installButton.style.pointerEvents = 'none';
  
  // Show the install prompt
  deferredPrompt.prompt();
  
  // Wait for the user's response
  const { outcome } = await deferredPrompt.userChoice;
  console.log(`📱 [PWA] User response: ${outcome}`);
  
  if (outcome === 'accepted') {
    console.log('✅ [PWA] User accepted the install');
    hideInstallButton(); // Remove button permanently
    showInstallSuccessMessage();
  } else {
    console.log('❌ [PWA] User dismissed the install');
    // Restore button
    installButton.style.opacity = '1';
    installButton.style.pointerEvents = 'auto';
  }
  
  // Clear the prompt
  deferredPrompt = null;
}

// ============================================
// CAPTURE INSTALL PROMPT
// ============================================
window.addEventListener('beforeinstallprompt', (e) => {
  console.log('📱 [PWA] Install prompt available');
  
  // Prevent the mini-infobar
  e.preventDefault();
  
  // Store the event
  deferredPrompt = e;
  
  // Show install button if not already installed
  if (!isAppInstalled()) {
    showInstallButton();
  }
});

// ============================================
// APP INSTALLED EVENT
// ============================================
window.addEventListener('appinstalled', () => {
  console.log('🎉 [PWA] App installed successfully');
  
  // Hide install button permanently
  hideInstallButton();
  
  // Show success message
  showInstallSuccessMessage();
  
  // Clear the prompt
  deferredPrompt = null;
});

// ============================================
// CHECK ON PAGE LOAD
// ============================================
window.addEventListener('load', () => {
  if (isAppInstalled()) {
    console.log('📱 [PWA] Running as installed app');
    document.body.classList.add('pwa-mode');
    hideInstallButton(); // Make sure button is hidden
  }
});

// ============================================
// SHOW SUCCESS MESSAGE
// ============================================
function showInstallSuccessMessage() {
  const successMessage = document.createElement('div');
  successMessage.innerHTML = `
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
  successMessage.style.cssText = `
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
  
  document.body.appendChild(successMessage);
  
  setTimeout(() => {
    successMessage.style.animation = 'slideOutDown 0.5s ease';
    setTimeout(() => {
      successMessage.remove();
    }, 500);
  }, 5000);
}

// ============================================
// OFFLINE/ONLINE DETECTION
// ============================================
window.addEventListener('online', () => {
  console.log('🟢 [PWA] Back online');
  showConnectionStatus('online');
});

window.addEventListener('offline', () => {
  console.log('🔴 [PWA] You are offline');
  showConnectionStatus('offline');
});

function showConnectionStatus(status) {
  const statusBanner = document.createElement('div');
  statusBanner.innerHTML = status === 'online' 
    ? '🟢 You are back online' 
    : '🔴 You are offline';
  
  statusBanner.style.cssText = `
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
  
  document.body.appendChild(statusBanner);
  
  setTimeout(() => {
    statusBanner.style.animation = 'slideOutUp 0.5s ease';
    setTimeout(() => {
      statusBanner.remove();
    }, 500);
  }, 3000);
}

// ============================================
// ANIMATIONS
// ============================================
const style = document.createElement('style');
style.textContent = `
  @keyframes slideInUp {
    from {
      transform: translateY(100px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
  
  @keyframes slideOutDown {
    from {
      transform: translateY(0);
      opacity: 1;
    }
    to {
      transform: translateY(100px);
      opacity: 0;
    }
  }
  
  @keyframes slideInDown {
    from {
      transform: translateX(-50%) translateY(-100px);
      opacity: 0;
    }
    to {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }
  }
  
  @keyframes slideOutUp {
    from {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }
    to {
      transform: translateX(-50%) translateY(-100px);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);