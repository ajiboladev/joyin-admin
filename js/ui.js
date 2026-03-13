/* ================================================================
   JOYIN ADMIN — SHARED UI UTILITIES
   Provides: toast notifications, loading overlay, confirm dialog,
             sidebar toggle, and skeleton row builder.
   Import this wherever you need these helpers.
   ================================================================ */

// ── TOAST NOTIFICATION ───────────────────────────────────────

/**
 * Container for stacked toasts. Created once and reused.
 * Appended to <body> automatically on first use.
 */
let _toastContainer = null;

function getToastContainer() {
  if (!_toastContainer) {
    _toastContainer = document.createElement("div");
    _toastContainer.id = "toastContainer";
    document.body.appendChild(_toastContainer);
  }
  return _toastContainer;
}

/**
 * Shows a brief toast notification at the bottom-right of the screen.
 *
 * @param {string} message - The text to display
 * @param {'success'|'error'|'warning'|'info'} type - Visual style
 * @param {number} [duration=3500] - Auto-dismiss after ms
 */
export function showToast(message, type = "info", duration = 3500) {
  const iconMap = {
    success: "fa-check-circle",
    error: "fa-times-circle",
    warning: "fa-exclamation-triangle",
    info: "fa-info-circle",
  };

  const container = getToastContainer();

  // Build the toast element
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `
        <i class="fas ${iconMap[type] || iconMap.info}"></i>
        <span>${message}</span>
    `;

  container.appendChild(toast);

  // Auto-remove after duration
  setTimeout(() => {
    toast.classList.add("removing");
    // Remove from DOM after CSS animation finishes (250ms)
    toast.addEventListener("animationend", () => toast.remove());
  }, duration);
}

// ── FULL-SCREEN LOADING OVERLAY ───────────────────────────────

/**
 * Singleton overlay used to block interaction while async work
 * runs (e.g. ban/delete). Always use showLoading / hideLoading
 * in a try/finally block so it always gets dismissed.
 *
 * Example:
 *   showLoading('Banning user…');
 *   try { await banUser(id); }
 *   finally { hideLoading(); }
 */
let _overlay = null;

function getOverlay() {
  if (!_overlay) {
    _overlay = document.createElement("div");
    _overlay.className = "loading-overlay";
    _overlay.innerHTML = `
            <div class="loading-spinner-box">
                <div class="spinner"></div>
                <p id="overlayMsg">Please wait…</p>
            </div>
        `;
    document.body.appendChild(_overlay);
  }
  return _overlay;
}

/**
 * Shows the loading overlay with a custom message.
 * @param {string} [msg='Please wait…'] - Label shown under spinner
 */
export function showLoading(msg = "Please wait…") {
  const overlay = getOverlay();
  overlay.querySelector("#overlayMsg").textContent = msg;
  overlay.classList.add("show");
}

/**
 * Hides the loading overlay.
 */
export function hideLoading() {
  const overlay = getOverlay();
  overlay.classList.remove("show");
}

// ── CONFIRM DIALOG ────────────────────────────────────────────

/**
 * Replaces native confirm() with a beautiful async dialog.
 * Returns a Promise that resolves true (confirmed) or false (cancelled).
 *
 * @param {object} opts
 * @param {string} opts.title         - Dialog heading
 * @param {string} opts.message       - Explanatory text
 * @param {string} [opts.confirmText='Confirm'] - Confirm button label
 * @param {'danger'|'warning'} [opts.intent='danger'] - Visual style
 * @returns {Promise<boolean>}
 */
export function showConfirm({
  title,
  message,
  confirmText = "Confirm",
  intent = "danger",
}) {
  return new Promise((resolve) => {
    // Create overlay
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay open";
    overlay.style.zIndex = "6000";

    // Choose icon
    const iconMap = {
      danger: "fa-trash-alt",
      warning: "fa-exclamation-triangle",
    };
    const icon = iconMap[intent] || iconMap.danger;

    const btnClass = intent === "warning" ? "btn-warning" : "btn-danger";

    overlay.innerHTML = `
            <div class="confirm-box">
                <div class="confirm-box__icon ${intent}">
                    <i class="fas ${icon}"></i>
                </div>
                <h3>${title}</h3>
                <p>${message}</p>
                <div class="confirm-box__actions">
                    <button class="btn" id="cancelConfirmBtn">Cancel</button>
                    <button class="btn ${btnClass}" id="okConfirmBtn">${confirmText}</button>
                </div>
            </div>
        `;

    document.body.appendChild(overlay);

    // Resolve and clean up
    const close = (result) => {
      overlay.remove();
      resolve(result);
    };

    overlay
      .querySelector("#okConfirmBtn")
      .addEventListener("click", () => close(true));
    overlay
      .querySelector("#cancelConfirmBtn")
      .addEventListener("click", () => close(false));

    // Clicking outside also cancels
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(false);
    });
  });
}

// ── SIDEBAR TOGGLE (mobile) ───────────────────────────────────

/**
 * Sets up the hamburger menu button to toggle the sidebar on mobile.
 * Call once on DOMContentLoaded.
 */
export function setupSidebar() {
  const hamburger = document.getElementById("hamburger");
  const sidebar = document.querySelector(".sidebar");
  const overlay = document.getElementById("sidebarOverlay");

  if (!hamburger || !sidebar) return;

  const open = () => {
    sidebar.classList.add("open");
    overlay?.classList.add("open");
  };

  const close = () => {
    sidebar.classList.remove("open");
    overlay?.classList.remove("open");
  };

  hamburger.addEventListener("click", () => {
    sidebar.classList.contains("open") ? close() : open();
  });

  // Close when user clicks the dimmed overlay
  overlay?.addEventListener("click", close);

  // Close when a nav link is clicked (useful on mobile)
  sidebar.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", close);
  });
}

// ── SKELETON TABLE ROWS ───────────────────────────────────────

/**
 * Returns an HTML string of skeleton placeholder rows for a table.
 * Use this while real data is loading so the layout doesn't jump.
 *
 * @param {number} cols - Number of columns
 * @param {number} [rows=5] - Number of skeleton rows to generate
 * @returns {string} HTML string
 */
export function skeletonRows(cols, rows = 5) {
  const cells = Array.from({ length: cols }, (_, i) => {
    // First cell gets an avatar placeholder
    if (i === 0) {
      return `<td><div class="skeleton skeleton-avatar" style="width:38px;height:38px;border-radius:50%;"></div></td>`;
    }
    // Vary widths to look natural
    const w = [80, 60, 70, 50, 90][i % 5];
    return `<td><div class="skeleton skeleton-cell" style="width:${w}%;height:14px;"></div></td>`;
  }).join("");

  return Array.from(
    { length: rows },
    () => `
        <tr class="skeleton-row">${cells}</tr>
    `,
  ).join("");
}

// ── BUTTON LOADING STATE ──────────────────────────────────────

/**
 * Puts a button into a loading state (spinner + text).
 * Returns a restore function to call when done.
 *
 * Example:
 *   const restore = setButtonLoading(btn, 'Deleting…');
 *   try { await deletePost(id); }
 *   finally { restore(); }
 *
 * @param {HTMLButtonElement} btn
 * @param {string} loadingText
 * @returns {Function} restore — call to reset the button
 */
export function setButtonLoading(btn, loadingText = "Loading…") {
  const original = btn.innerHTML;
  const wasDisabled = btn.disabled;

  btn.disabled = true;
  btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${loadingText}`;

  // Return a restore closure
  return () => {
    btn.innerHTML = original;
    btn.disabled = wasDisabled;
  };
}
