/**
 * ============================================================================
 * CENTRALIZED STUDENT ATTENDANCE MANAGEMENT SYSTEM - CLIENT CONFIGURATION
 * ============================================================================
 */

const CONFIG = {
  // Replace this with your actual Google Apps Script Web App URL after deployment
  // Example: "https://script.google.com/macros/s/AKfycbx.../exec"
  API_BASE_URL: localStorage.getItem("csams_api_url") || "https://script.google.com/macros/s/AKfycbxPAsGAQdJDL5Ihf1JQnOl69oF7UfKzZas7MAfVQptkPdT67AaJ_YYIZVyImuOESbvN/exec",

  // Authoritative Timezone
  TIMEZONE: "Asia/Kolkata",

  // Student Attendance polling frequency (milliseconds) - between 5 to 10 seconds
  POLL_INTERVAL_MS: 6000,

  // Storage Keys for non-sensitive local state (Admin token)
  STORAGE_KEYS: {
    API_URL: "csams_api_url",
    ADMIN_TOKEN: "csams_admin_session_token",
    ADMIN_EXPIRY: "csams_admin_session_expiry",
    ADMIN_USER: "csams_admin_username"
  }
};

/**
 * Toast Notification Utility
 */
function showToast(message, type = "info", duration = 4000) {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  const iconMap = {
    success: "✓",
    error: "✕",
    warning: "⚠",
    info: "ℹ"
  };

  toast.innerHTML = `
    <span style="font-weight: bold; font-size: 1.1em;">${iconMap[type] || "ℹ"}</span>
    <span style="flex: 1;">${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(100%)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Time and Date Format Helpers
 */
function formatDateTime(dtStr) {
  if (!dtStr) return "-";
  try {
    const d = new Date(dtStr);
    if (isNaN(d.getTime())) return dtStr;
    return d.toLocaleString("en-IN", {
      timeZone: CONFIG.TIMEZONE,
      dateStyle: "medium",
      timeStyle: "short"
    });
  } catch (e) {
    return dtStr;
  }
}

function formatDate(dtStr) {
  if (!dtStr) return "-";
  try {
    const d = new Date(dtStr);
    if (isNaN(d.getTime())) return dtStr;
    return d.toLocaleDateString("en-IN", {
      timeZone: CONFIG.TIMEZONE,
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  } catch (e) {
    return dtStr;
  }
}

