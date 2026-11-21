/**
 * ============================================================================
 * CENTRALIZED STUDENT ATTENDANCE MANAGEMENT SYSTEM - ADMIN CONTROLLER
 * ============================================================================
 */

document.addEventListener("DOMContentLoaded", () => {
  // Check if we are on the login page or the dashboard
  if (document.getElementById("adminLoginForm")) {
    initAdminLogin();
  } else if (document.getElementById("adminDashboardLayout")) {
    initAdminDashboard();
  }
});

/* ==========================================================================
   1. ADMIN LOGIN
   ========================================================================== */
function initAdminLogin() {
  const form = document.getElementById("adminLoginForm");
  const userInput = document.getElementById("adminUsername");
  const passInput = document.getElementById("adminPassword");
  const loginBtn = document.getElementById("btnLoginSubmit");
  const alertEl = document.getElementById("loginAlert");

  // Pre-fill API URL config modal if present
  const configBtn = document.getElementById("btnConfigApiUrl");
  if (configBtn) {
    configBtn.addEventListener("click", () => {
      const currentUrl = localStorage.getItem(CONFIG.STORAGE_KEYS.API_URL) || "";
      const newUrl = prompt("Enter your Google Apps Script Web App URL:", currentUrl);
      if (newUrl !== null) {
        localStorage.setItem(CONFIG.STORAGE_KEYS.API_URL, newUrl.trim());
        CONFIG.API_BASE_URL = newUrl.trim();
        showToast("Web App API URL updated!", "success");
      }
    });
  }

  // If already logged in with valid token, redirect to dashboard
  const token = localStorage.getItem(CONFIG.STORAGE_KEYS.ADMIN_TOKEN);
  const expiry = parseInt(localStorage.getItem(CONFIG.STORAGE_KEYS.ADMIN_EXPIRY), 10);
  if (token && expiry && Date.now() < expiry) {
    window.location.href = "admin-dashboard.html";
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = userInput.value.trim();
    const password = passInput.value.trim();

    if (!username || !password) {
      showLoginAlert("Please enter both username and password.");
      return;
    }

    loginBtn.disabled = true;
    loginBtn.innerHTML = `<span class="spinner"></span> Authenticating...`;
    hideLoginAlert();

    try {
      const res = await API.adminLogin(username, password);

      if (!res.success) {
        showLoginAlert(res.message || "Invalid credentials.");
        loginBtn.disabled = false;
        loginBtn.innerHTML = `Login to Dashboard`;
        return;
      }

      // Store session securely in localStorage
      localStorage.setItem(CONFIG.STORAGE_KEYS.ADMIN_TOKEN, res.data.sessionToken);
      localStorage.setItem(CONFIG.STORAGE_KEYS.ADMIN_EXPIRY, res.data.expiresAt);
      localStorage.setItem(CONFIG.STORAGE_KEYS.ADMIN_USER, res.data.username);

      showToast("Login successful! Redirecting...", "success");
      setTimeout(() => {
        window.location.href = "admin-dashboard.html";
      }, 500);

    } catch (err) {
      showLoginAlert("Login failed due to a network error. Please try again.");
      loginBtn.disabled = false;
      loginBtn.innerHTML = `Login to Dashboard`;
    }
  });

  function showLoginAlert(msg) {
    if (alertEl) {
      alertEl.textContent = msg;
      alertEl.style.display = "block";
    }
  }

  function hideLoginAlert() {
    if (alertEl) alertEl.style.display = "none";
  }
}

/* ==========================================================================
   2. ADMIN DASHBOARD
   ========================================================================== */
let dashboardStats = null;
let allStudentsCache = [];
let allClassesCache = [];

function initAdminDashboard() {
  // Validate Session Token
  const token = localStorage.getItem(CONFIG.STORAGE_KEYS.ADMIN_TOKEN);
  const expiry = parseInt(localStorage.getItem(CONFIG.STORAGE_KEYS.ADMIN_EXPIRY), 10);

  if (!token || !expiry || Date.now() > expiry) {
    handleAdminLogout(true);
    return;
  }

  // Setup UI Events
  setupNavigation();
  setupAttendanceControls();
  setupStudentManagement();
  setupClassManagement();
  setupExcelImportExport();
  setupSettings();

  // Load Initial Data
  refreshDashboard();

  // Periodically refresh dashboard stats every 30 seconds
  setInterval(refreshDashboard, 30000);
}

/**
 * Sidebar Navigation & Tab Switching
 */
function setupNavigation() {
  const navLinks = document.querySelectorAll(".sidebar-link[data-tab]");
  const tabPanels = document.querySelectorAll(".tab-panel");
  const pageTitle = document.getElementById("adminPageTitle");
  const mobileMenuBtn = document.getElementById("mobileMenuBtn");
  const sidebar = document.getElementById("adminSidebar");
  const btnLogout = document.getElementById("btnLogout");

  navLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const targetTab = link.getAttribute("data-tab");

      navLinks.forEach((l) => l.classList.remove("active"));
      link.classList.add("active");

      tabPanels.forEach((p) => (p.style.display = "none"));
      const activePanel = document.getElementById(`panel-${targetTab}`);
      if (activePanel) activePanel.style.display = "block";

      if (pageTitle) pageTitle.textContent = link.getAttribute("data-title") || "Dashboard";

      // Close mobile menu on click
      if (sidebar) sidebar.classList.remove("open");

      // Load specific tab data on demand
      if (targetTab === "students") loadStudentsList();
      if (targetTab === "classes") loadClassesList();
      if (targetTab === "attendance") {
        populateClassDropdowns();
        AttendanceManager.loadAttendanceRecords();
      }
      if (targetTab === "excel") populateClassDropdowns();
    });
  });

  if (mobileMenuBtn && sidebar) {
    mobileMenuBtn.addEventListener("click", () => {
      sidebar.classList.toggle("open");
    });
  }

  if (btnLogout) {
    btnLogout.addEventListener("click", () => {
      if (confirm("Are you sure you want to log out?")) {
        handleAdminLogout();
      }
    });
  }
}

async function handleAdminLogout(expired = false) {
  try {
    await API.adminLogout();
  } catch (e) {
    // Ignore error on logout
  }
  localStorage.removeItem(CONFIG.STORAGE_KEYS.ADMIN_TOKEN);
  localStorage.removeItem(CONFIG.STORAGE_KEYS.ADMIN_EXPIRY);
  localStorage.removeItem(CONFIG.STORAGE_KEYS.ADMIN_USER);

  if (expired) {
    alert("Your session has expired. Please log in again.");
  }
  window.location.href = "admin-login.html";
}

/**
 * Refresh Dashboard Statistics and KPI cards
 */
async function refreshDashboard() {
  try {
    const res = await API.getDashboardStats();

    if (!res.success) {
      if (res.message && res.message.includes("Unauthorized")) {
        handleAdminLogout(true);
        return;
      }
      showToast(res.message || "Failed to load dashboard statistics.", "error");
      return;
    }

    dashboardStats = res.data;
    renderDashboardUI(dashboardStats);

  } catch (err) {
    console.error("Dashboard error:", err);
  }
}

function renderDashboardUI(stats) {
  // Update Topbar Time & Portal Status
  const topbarTime = document.getElementById("topbarServerTime");
  const portalBadge = document.getElementById("topbarPortalStatus");

  if (topbarTime && stats.serverTime) {
    topbarTime.textContent = `${stats.serverTime} (IST)`;
  }

  const isEnabled = stats.portalStatus === "ENABLED";
  if (portalBadge) {
    portalBadge.className = `status-indicator-badge ${isEnabled ? "enabled" : "disabled"}`;
    portalBadge.innerHTML = `<span class="pulse-dot ${isEnabled ? "online" : "closed"}"></span> Attendance ${stats.portalStatus}`;
  }

  // Update KPI metric numbers
  document.getElementById("kpiTotalStudents").textContent = stats.totalStudents;
  document.getElementById("kpiTotalClasses").textContent = stats.totalClasses;
  document.getElementById("kpiPresentStudents").textContent = stats.presentStudents;
  document.getElementById("kpiAbsentStudents").textContent = stats.absentStudents;
  document.getElementById("kpiAttendancePercentage").textContent = `${stats.attendancePercentage}%`;

  // Current active class display
  const activeClassTitle = document.getElementById("activeClassTitle");
  const activeClassTiming = document.getElementById("activeClassTiming");
  const activeClassWindow = document.getElementById("activeClassWindow");

  if (stats.currentClass) {
    activeClassTitle.textContent = stats.currentClass.className;
    activeClassTiming.textContent = `${stats.currentClass.classDate} | ${stats.currentClass.startTime} - ${stats.currentClass.endTime}`;
    activeClassWindow.textContent = `Window: ${stats.currentClass.openingTime} - ${stats.currentClass.closingTime}`;
  } else {
    activeClassTitle.textContent = "No Active Class Session";
    activeClassTiming.textContent = "Schedule or select a class below to enable attendance.";
    activeClassWindow.textContent = "-";
  }

  // Quick buttons styling based on status
  const btnEnable = document.getElementById("btnQuickEnable");
  const btnDisable = document.getElementById("btnQuickDisable");

  if (btnEnable && btnDisable) {
    if (isEnabled) {
      btnEnable.style.opacity = "0.6";
      btnDisable.style.opacity = "1";
    } else {
      btnEnable.style.opacity = "1";
      btnDisable.style.opacity = "0.6";
    }
  }
}

/**
 * Attendance Control Buttons (ENABLE / DISABLE)
 */
function setupAttendanceControls() {
  const btnEnable = document.getElementById("btnQuickEnable");
  const btnDisable = document.getElementById("btnQuickDisable");
  const modalEnable = document.getElementById("modalEnableAttendance");
  const btnConfirmEnable = document.getElementById("btnConfirmEnableAttendance");
  const btnCancelEnable = document.getElementById("btnCancelEnableAttendance");

  if (btnEnable) {
    btnEnable.addEventListener("click", async () => {
      // Open class selection modal to enable
      await populateClassDropdowns();
      modalEnable.classList.add("active");
    });
  }

  if (btnCancelEnable) {
    btnCancelEnable.addEventListener("click", () => {
      modalEnable.classList.remove("active");
    });
  }

  if (btnConfirmEnable) {
    btnConfirmEnable.addEventListener("click", async () => {
      const selectEl = document.getElementById("selectClassToEnable");
      const classId = selectEl.value;

      if (!classId) {
        alert("Please select a class to enable attendance.");
        return;
      }

      btnConfirmEnable.disabled = true;
      btnConfirmEnable.innerHTML = `<span class="spinner"></span> Enabling...`;

      try {
        const res = await API.enableAttendance(classId);

        if (!res.success) {
          alert(res.message || "Failed to enable attendance.");
          btnConfirmEnable.disabled = false;
          btnConfirmEnable.innerHTML = `Enable Attendance Now`;
          return;
        }

        showToast(res.message, "success");
        modalEnable.classList.remove("active");
        refreshDashboard();

      } catch (err) {
        alert("Error enabling attendance: " + err.message);
      } finally {
        btnConfirmEnable.disabled = false;
        btnConfirmEnable.innerHTML = `Enable Attendance Now`;
      }
    });
  }

  if (btnDisable) {
    btnDisable.addEventListener("click", async () => {
      if (!confirm("Are you sure you want to DISABLE attendance immediately? Students will no longer be able to submit.")) {
        return;
      }

      btnDisable.disabled = true;
      btnDisable.innerHTML = `<span class="spinner"></span> Disabling...`;

      try {
        const res = await API.disableAttendance();

        if (!res.success) {
          showToast(res.message || "Failed to disable attendance.", "error");
          return;
        }

        showToast("Attendance disabled successfully.", "success");
        refreshDashboard();

      } catch (err) {
        showToast("Error disabling attendance.", "error");
      } finally {
        btnDisable.disabled = false;
        btnDisable.innerHTML = `✕ DISABLE ATTENDANCE`;
      }
    });
  }
}

/**
 * ==========================================================================
 * 3. STUDENT MANAGEMENT
 * ==========================================================================
 */
function setupStudentManagement() {
  const searchInput = document.getElementById("studentSearchInput");
  const btnOpenUploadModal = document.getElementById("btnOpenUploadModal");
  const modalUpload = document.getElementById("modalUploadStudents");
  const btnCloseUpload = document.getElementById("btnCloseUploadModal");

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      const query = searchInput.value.toLowerCase().trim();
      const filtered = allStudentsCache.filter(
        (s) => s.rollNumber.toLowerCase().includes(query) || s.studentName.toLowerCase().includes(query)
      );
      renderStudentsTable(filtered);
    });
  }

  if (btnOpenUploadModal && modalUpload) {
    btnOpenUploadModal.addEventListener("click", () => {
      modalUpload.classList.add("active");
    });
  }

  if (btnCloseUpload && modalUpload) {
    btnCloseUpload.addEventListener("click", () => {
      modalUpload.classList.remove("active");
    });
  }
}

async function loadStudentsList() {
  const tableBody = document.getElementById("studentsTableBody");
  if (!tableBody) return;

  tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 24px;"><span class="spinner spinner-dark"></span> Loading students from Google Sheets...</td></tr>`;

  try {
    const res = await API.getStudentsList();

    if (!res.success) {
      showToast(res.message || "Failed to load students.", "error");
      return;
    }

    allStudentsCache = res.data || [];
    renderStudentsTable(allStudentsCache);

  } catch (err) {
    console.error("Error loading students:", err);
    showToast("Network error loading students.", "error");
  }
}

function renderStudentsTable(students) {
  const tableBody = document.getElementById("studentsTableBody");
  const countEl = document.getElementById("studentsCountBadge");
  if (!tableBody) return;

  if (countEl) countEl.textContent = `${students.length} students`;

  if (students.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 24px; color: var(--slate-400);">No student records found. Upload an Excel file to get started.</td></tr>`;
    return;
  }

  tableBody.innerHTML = students.map((s, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td><strong>${s.rollNumber}</strong></td>
      <td>${escapeHtml(s.studentName)}</td>
      <td>${s.email || "-"}</td>
      <td>
        <span class="badge ${s.status === 'ACTIVE' ? 'badge-active' : 'badge-absent'}">
          ${s.status || "ACTIVE"}
        </span>
      </td>
    </tr>
  `).join("");
}

/**
 * ==========================================================================
 * 4. CLASS SCHEDULE MANAGEMENT
 * ==========================================================================
 */
function setupClassManagement() {
  const btnOpenModal = document.getElementById("btnOpenCreateClassModal");
  const modalCreate = document.getElementById("modalCreateClass");
  const btnCloseModal = document.getElementById("btnCloseCreateClassModal");
  const formCreate = document.getElementById("formCreateClass");

  if (btnOpenModal && modalCreate) {
    btnOpenModal.addEventListener("click", () => {
      // Pre-fill today's date
      const dateInput = document.getElementById("classDateInput");
      if (dateInput && !dateInput.value) {
        dateInput.value = new Date().toISOString().substring(0, 10);
      }
      modalCreate.classList.add("active");
    });
  }

  if (btnCloseModal && modalCreate) {
    btnCloseModal.addEventListener("click", () => {
      modalCreate.classList.remove("active");
    });
  }

  if (formCreate) {
    formCreate.addEventListener("submit", async (e) => {
      e.preventDefault();

      const className = document.getElementById("classNameInput").value.trim();
      const classDate = document.getElementById("classDateInput").value.trim();
      const startTime = document.getElementById("classStartTimeInput").value.trim();
      const endTime = document.getElementById("classEndTimeInput").value.trim();
      const openingTime = document.getElementById("classOpeningTimeInput").value.trim();
      const closingTime = document.getElementById("classClosingTimeInput").value.trim();

      // Client-side validations
      if (!className || !classDate || !startTime || !endTime || !openingTime || !closingTime) {
        alert("All fields are mandatory.");
        return;
      }

      if (startTime >= endTime) {
        alert("Class Start Time must be earlier than End Time.");
        return;
      }
      if (openingTime < startTime) {
        alert("Attendance Opening Time must not be before Class Start Time.");
        return;
      }
      if (closingTime <= openingTime) {
        alert("Attendance Closing Time must be after Opening Time.");
        return;
      }
      if (closingTime > endTime) {
        alert("Attendance Closing Time must not exceed Class End Time.");
        return;
      }

      const submitBtn = formCreate.querySelector("button[type='submit']");
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span class="spinner"></span> Creating Class...`;

      try {
        const res = await API.createClass({
          className,
          classDate,
          startTime,
          endTime,
          openingTime,
          closingTime
        });

        if (!res.success) {
          alert(res.message || "Failed to create class.");
          submitBtn.disabled = false;
          submitBtn.innerHTML = `Save Class Schedule`;
          return;
        }

        showToast("Class created successfully!", "success");
        formCreate.reset();
        modalCreate.classList.remove("active");

        loadClassesList();
        refreshDashboard();

      } catch (err) {
        alert("Error creating class: " + err.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `Save Class Schedule`;
      }
    });
  }
}

async function loadClassesList() {
  const tableBody = document.getElementById("classesTableBody");
  if (!tableBody) return;

  tableBody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 24px;"><span class="spinner spinner-dark"></span> Loading classes from Google Sheets...</td></tr>`;

  try {
    const res = await API.getClasses();

    if (!res.success) {
      showToast(res.message || "Failed to load classes.", "error");
      return;
    }

    allClassesCache = res.data || [];
    renderClassesTable(allClassesCache);

  } catch (err) {
    console.error("Error loading classes:", err);
    showToast("Network error loading classes.", "error");
  }
}

function renderClassesTable(classes) {
  const tableBody = document.getElementById("classesTableBody");
  const countEl = document.getElementById("classesCountBadge");
  if (!tableBody) return;

  if (countEl) countEl.textContent = `${classes.length} classes`;

  if (classes.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 24px; color: var(--slate-400);">No classes scheduled yet. Click "Create New Class" to add one.</td></tr>`;
    return;
  }

  tableBody.innerHTML = classes.map((c) => `
    <tr>
      <td><code>${c.classId}</code></td>
      <td><strong>${escapeHtml(c.className)}</strong></td>
      <td>${c.classDate}</td>
      <td>${c.startTime} - ${c.endTime}</td>
      <td>${c.openingTime} - ${c.closingTime}</td>
      <td>
        <span class="badge ${c.isActive ? 'badge-present' : 'badge-scheduled'}">
          ${c.isActive ? 'ACTIVE NOW' : c.adminStatus}
        </span>
      </td>
      <td>
        <button class="btn-portal btn-primary" style="padding: 6px 12px; font-size: 0.8rem; width: auto;" onclick="quickEnableClass('${c.classId}')">
          Enable
        </button>
      </td>
    </tr>
  `).join("");
}

window.quickEnableClass = async function(classId) {
  if (!confirm(`Are you sure you want to enable attendance for Class ID: ${classId}?`)) return;

  try {
    const res = await API.enableAttendance(classId);
    if (!res.success) {
      alert(res.message || "Cannot enable attendance.");
      return;
    }
    showToast(res.message, "success");
    loadClassesList();
    refreshDashboard();
  } catch (err) {
    alert("Error: " + err.message);
  }
};

/**
 * Populate Class Dropdowns in Attendance & Export tabs
 */
async function populateClassDropdowns() {
  if (allClassesCache.length === 0) {
    try {
      const res = await API.getClasses();
      if (res.success) allClassesCache = res.data || [];
    } catch (e) {}
  }

  const dropdowns = [
    document.getElementById("selectClassToEnable"),
    document.getElementById("attFilterClass"),
    document.getElementById("exportSelectClass")
  ];

  dropdowns.forEach((dd) => {
    if (!dd) return;
    const currentVal = dd.value;
    const isFilter = dd.id === "attFilterClass";

    dd.innerHTML = isFilter ? `<option value="">All Classes</option>` : `<option value="">-- Select a Class --</option>`;

    allClassesCache.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.classId;
      opt.textContent = `${c.className} (${c.classDate}) [${c.classId}]`;
      if (c.classId === currentVal) opt.selected = true;
      dd.appendChild(opt);
    });
  });
}

/**
 * ==========================================================================
 * 5. EXCEL IMPORT & EXPORT
 * ==========================================================================
 */
function setupExcelImportExport() {
  const dropzone = document.getElementById("excelDropzone");
  const fileInput = document.getElementById("excelFileInput");
  const previewCard = document.getElementById("excelPreviewCard");
  const previewTableBody = document.getElementById("excelPreviewTableBody");
  const previewSummary = document.getElementById("excelPreviewSummary");
  const btnConfirmUpload = document.getElementById("btnConfirmExcelUpload");
  const btnDownloadSample = document.getElementById("btnDownloadSampleTemplate");

  // Sample template download
  if (btnDownloadSample) {
    btnDownloadSample.addEventListener("click", () => {
      ExcelEngine.downloadSampleTemplate();
    });
  }

  // File drag & drop
  if (dropzone && fileInput) {
    dropzone.addEventListener("click", () => fileInput.click());

    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });

    dropzone.addEventListener("dragleave", () => {
      dropzone.classList.remove("dragover");
    });

    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
      if (e.dataTransfer.files.length > 0) {
        handleFileSelect(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener("change", (e) => {
      if (e.target.files.length > 0) {
        handleFileSelect(e.target.files[0]);
      }
    });
  }

  async function handleFileSelect(file) {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      alert("Please upload a valid Excel file (.xlsx or .xls)");
      return;
    }

    try {
      const result = await ExcelEngine.parseStudentFile(file);

      previewCard.style.display = "block";
      previewSummary.innerHTML = `
        <strong>File:</strong> ${file.name} |
        <strong>Valid Records:</strong> <span style="color: var(--success-dark); font-weight: bold;">${result.validRecords.length}</span> |
        <strong>Invalid Rows:</strong> <span style="color: var(--danger); font-weight: bold;">${result.invalidRecords.length}</span>
      `;

      previewTableBody.innerHTML = result.validRecords.slice(0, 10).map((r, i) => `
        <tr>
          <td>${i + 1}</td>
          <td><strong>${r.rollNumber}</strong></td>
          <td>${escapeHtml(r.studentName)}</td>
          <td>${r.email || "-"}</td>
          <td><span class="badge badge-active">${r.status}</span></td>
        </tr>
      `).join("");

      if (result.validRecords.length > 10) {
        previewTableBody.innerHTML += `<tr><td colspan="5" style="text-align: center; color: var(--slate-400);">...and ${result.validRecords.length - 10} more records</td></tr>`;
      }

      btnConfirmUpload.disabled = result.validRecords.length === 0;

    } catch (err) {
      alert("Failed to read Excel file: " + err.message);
    }
  }

  if (btnConfirmUpload) {
    btnConfirmUpload.addEventListener("click", async () => {
      if (ExcelEngine.parsedStudentsData.length === 0) {
        alert("No valid student records to upload.");
        return;
      }

      btnConfirmUpload.disabled = true;
      btnConfirmUpload.innerHTML = `<span class="spinner"></span> Saving to Google Sheets...`;

      try {
        const res = await API.uploadStudents(ExcelEngine.parsedStudentsData);

        if (!res.success) {
          alert(res.message || "Failed to upload students.");
          btnConfirmUpload.disabled = false;
          btnConfirmUpload.innerHTML = `Save ${ExcelEngine.parsedStudentsData.length} Students to Database`;
          return;
        }

        showToast(`Successfully saved ${res.data.addedCount + res.data.updatedCount} students to Google Sheets!`, "success");

        // Close modal if in modal, or reset preview
        const modalUpload = document.getElementById("modalUploadStudents");
        if (modalUpload) modalUpload.classList.remove("active");

        previewCard.style.display = "none";
        ExcelEngine.parsedStudentsData = [];
        fileInput.value = "";

        loadStudentsList();
        refreshDashboard();

      } catch (err) {
        alert("Upload error: " + err.message);
      } finally {
        btnConfirmUpload.disabled = false;
        btnConfirmUpload.innerHTML = `Save Students to Database`;
      }
    });
  }

  // Export Buttons
  const btnExportStudents = document.getElementById("btnExportStudents");
  const btnExportHistory = document.getElementById("btnExportHistory");
  const btnExportClassReport = document.getElementById("btnExportClassReport");

  if (btnExportStudents) {
    btnExportStudents.addEventListener("click", async () => {
      btnExportStudents.disabled = true;
      try {
        const res = await API.getStudentsList();
        if (res.success) ExcelEngine.exportStudentsList(res.data);
      } finally {
        btnExportStudents.disabled = false;
      }
    });
  }

  if (btnExportHistory) {
    btnExportHistory.addEventListener("click", async () => {
      btnExportHistory.disabled = true;
      try {
        const res = await API.getAttendanceRecords();
        if (res.success) ExcelEngine.exportAttendanceHistory(res.data);
      } finally {
        btnExportHistory.disabled = false;
      }
    });
  }

  if (btnExportClassReport) {
    btnExportClassReport.addEventListener("click", async () => {
      const selectClass = document.getElementById("exportSelectClass");
      const classId = selectClass.value;

      if (!classId) {
        alert("Please select a class to export its attendance report.");
        return;
      }

      btnExportClassReport.disabled = true;
      try {
        const res = await API.getClassAttendanceReport(classId);
        if (res.success) {
          ExcelEngine.exportClassAttendanceReport(res.data.report, res.data.classInfo);
        } else {
          alert(res.message || "Failed to generate report.");
        }
      } finally {
        btnExportClassReport.disabled = false;
      }
    });
  }

  // Attendance Tab Filter Events
  const attFilterClass = document.getElementById("attFilterClass");
  const attFilterDate = document.getElementById("attFilterDate");
  const attFilterStatus = document.getElementById("attFilterStatus");
  const attSearchInput = document.getElementById("attSearchInput");
  const btnAttSearch = document.getElementById("btnAttSearch");
  const btnLoadClassReport = document.getElementById("btnLoadClassReport");

  if (btnAttSearch) {
    btnAttSearch.addEventListener("click", () => AttendanceManager.loadAttendanceRecords());
  }

  if (attFilterClass) {
    attFilterClass.addEventListener("change", () => AttendanceManager.loadAttendanceRecords());
  }

  if (btnLoadClassReport) {
    btnLoadClassReport.addEventListener("click", () => {
      const classId = attFilterClass?.value;
      if (!classId) {
        alert("Please select a specific class from the filter dropdown first.");
        return;
      }
      AttendanceManager.loadClassReport(classId);
    });
  }
}

/**
 * ==========================================================================
 * 6. SETTINGS & INITIALIZATION
 * ==========================================================================
 */
function setupSettings() {
  const currentUrlInput = document.getElementById("settingsApiUrlInput");
  const btnSaveApiUrl = document.getElementById("btnSaveApiUrl");
  const btnTestConnection = document.getElementById("btnTestConnection");
  const btnInitDb = document.getElementById("btnInitializeDatabase");

  if (currentUrlInput) {
    currentUrlInput.value = localStorage.getItem(CONFIG.STORAGE_KEYS.API_URL) || "";
  }

  if (btnSaveApiUrl && currentUrlInput) {
    btnSaveApiUrl.addEventListener("click", () => {
      const newUrl = currentUrlInput.value.trim();
      localStorage.setItem(CONFIG.STORAGE_KEYS.API_URL, newUrl);
      CONFIG.API_BASE_URL = newUrl;
      showToast("API Base URL saved successfully!", "success");
    });
  }

  if (btnTestConnection) {
    btnTestConnection.addEventListener("click", async () => {
      btnTestConnection.disabled = true;
      btnTestConnection.innerHTML = `<span class="spinner"></span> Testing connection...`;

      try {
        const res = await API.getAttendanceStatus();
        if (res.success) {
          alert(`Connection Successful!\nServer Time: ${res.data.serverTime}\nTimezone: ${res.timeZone}\nPortal Status: ${res.data.portalStatus}`);
        } else {
          alert(`Connection failed: ${res.message}`);
        }
      } catch (err) {
        alert(`Connection Error: ${err.message}`);
      } finally {
        btnTestConnection.disabled = false;
        btnTestConnection.innerHTML = `Test API Connection`;
      }
    });
  }

  if (btnInitDb) {
    btnInitDb.addEventListener("click", async () => {
      if (!confirm("Initialize Google Sheets database? This will create all 4 worksheets (Students, Classes, Attendance, Settings) if they don't already exist.")) {
        return;
      }

      btnInitDb.disabled = true;
      btnInitDb.innerHTML = `<span class="spinner"></span> Initializing...`;

      try {
        const res = await API.initializeDatabase();
        if (res.success) {
          showToast("Database initialized successfully!", "success");
          refreshDashboard();
        } else {
          alert(res.message);
        }
      } catch (err) {
        alert("Error: " + err.message);
      } finally {
        btnInitDb.disabled = false;
        btnInitDb.innerHTML = `Initialize Database Sheets`;
      }
    });
  }
}

