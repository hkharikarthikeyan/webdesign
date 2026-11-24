/**
 * ============================================================================
 * CENTRALIZED STUDENT ATTENDANCE MANAGEMENT SYSTEM - STUDENT PORTAL LOGIC
 * ============================================================================
 */

document.addEventListener("DOMContentLoaded", () => {
  initStudentPortal();
});

let currentStatusData = null;
let pollTimer = null;
let verifiedStudent = null;

function initStudentPortal() {
  const rollInput = document.getElementById("studentRollInput");
  const btnVerify = document.getElementById("btnVerifyRoll");
  const btnSubmit = document.getElementById("btnSubmitAttendance");
  const btnReset = document.getElementById("btnResetVerification");

  // Initial status check
  fetchLiveAttendanceStatus();

  // Setup periodic polling every 6 seconds
  pollTimer = setInterval(fetchLiveAttendanceStatus, CONFIG.POLL_INTERVAL_MS);

  // Instant refresh when user returns to tab
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      fetchLiveAttendanceStatus();
    }
  });

  window.addEventListener("focus", () => {
    fetchLiveAttendanceStatus();
  });

  // Verify Roll Number Button
  if (btnVerify) {
    btnVerify.addEventListener("click", handleVerifyRoll);
  }

  // Allow pressing Enter in Roll Input
  if (rollInput) {
    rollInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleVerifyRoll();
      }
    });

    rollInput.addEventListener("input", () => {
      // Clear verification if student modifies roll number
      if (verifiedStudent) {
        resetVerificationState();
      }
    });
  }

  // Submit Attendance Button
  if (btnSubmit) {
    btnSubmit.addEventListener("click", handleSubmitAttendance);
  }

  // Reset Button
  if (btnReset) {
    btnReset.addEventListener("click", resetVerificationState);
  }
}

/**
 * Fetch Real-time Attendance Status from Google Apps Script Web App
 */
async function fetchLiveAttendanceStatus() {
  const timePill = document.getElementById("serverTimeDisplay");
  const pulseDot = document.getElementById("pulseIndicator");

  try {
    const res = await API.getAttendanceStatus();

    if (res.unconfigured) {
      renderUnconfiguredNotice();
      return;
    }

    if (!res.success) {
      console.warn("Status fetch failed:", res.message);
      return;
    }

    currentStatusData = res.data;
    renderStatusUI(currentStatusData);

  } catch (err) {
    console.error("Error fetching status:", err);
  }
}

/**
 * Render Status Cards and Live Badges
 */
function renderStatusUI(data) {
  const statusCard = document.getElementById("statusCard");
  const statusTitle = document.getElementById("statusTitle");
  const statusMsg = document.getElementById("statusMessage");
  const statusIcon = document.getElementById("statusIcon");
  const pulseDot = document.getElementById("pulseIndicator");
  const serverTimeDisplay = document.getElementById("serverTimeDisplay");

  // Update Server Clock Display (Asia/Kolkata)
  if (serverTimeDisplay && data.serverTime) {
    serverTimeDisplay.textContent = `Server Time: ${data.serverTime} (${data.serverDate || ""})`;
  }

  // Update Class Details Card
  const classDetailsCard = document.getElementById("classDetailsCard");
  const classNameEl = document.getElementById("displayClassName");
  const classDateEl = document.getElementById("displayClassDate");
  const classTimingEl = document.getElementById("displayClassTiming");
  const classWindowEl = document.getElementById("displayAttendanceWindow");

  if (data.classDetails) {
    classDetailsCard.style.display = "block";
    classNameEl.textContent = data.classDetails.className || "Class Scheduled";
    classDateEl.textContent = data.classDetails.classDate || "-";
    classTimingEl.textContent = `${data.classDetails.startTime} - ${data.classDetails.endTime}`;
    classWindowEl.textContent = `${data.classDetails.openingTime} - ${data.classDetails.closingTime}`;
  } else {
    classDetailsCard.style.display = "none";
  }

  // Reset classes on statusCard
  statusCard.className = "status-card";
  pulseDot.className = "pulse-dot";

  // Check states
  if (data.isAttendanceOpen) {
    // OPEN
    statusCard.classList.add("open");
    pulseDot.classList.add("online");
    statusIcon.textContent = "✓";
    statusTitle.textContent = "Attendance is Open";
    statusMsg.textContent = data.message || "Attendance is now open. You can mark your attendance.";
  } else {
    // CLOSED / NOT STARTED / DISABLED
    if (data.statusCode === "NOT_STARTED") {
      statusCard.classList.add("pending");
      pulseDot.classList.add("warning");
      statusIcon.textContent = "⏳";
      statusTitle.textContent = "Attendance Not Started";
      statusMsg.textContent = data.message || "Attendance has not started yet. Please wait for the scheduled time.";
    } else if (data.statusCode === "ADMIN_DISABLED") {
      statusCard.classList.add("closed");
      pulseDot.classList.add("closed");
      statusIcon.textContent = "✕";
      statusTitle.textContent = "Attendance Closed";
      statusMsg.textContent = data.message || "Attendance is currently closed by the administrator.";
    } else if (data.statusCode === "ENDED") {
      statusCard.classList.add("closed");
      pulseDot.classList.add("closed");
      statusIcon.textContent = "🔒";
      statusTitle.textContent = "Attendance Closed";
      statusMsg.textContent = data.message || "Attendance submission time has ended.";
    } else {
      statusCard.classList.add("idle");
      pulseDot.classList.add("closed");
      statusIcon.textContent = "ℹ";
      statusTitle.textContent = "No Active Session";
      statusMsg.textContent = data.message || "No active class is scheduled currently.";
    }
  }

  // Update Submit button eligibility
  updateSubmitButtonState();
}

/**
 * Handle Roll Number Verification Step
 */
async function handleVerifyRoll() {
  const rollInput = document.getElementById("studentRollInput");
  const btnVerify = document.getElementById("btnVerifyRoll");
  const errorAlert = document.getElementById("studentErrorAlert");

  const rollNumber = rollInput.value.trim().toUpperCase();

  if (!rollNumber) {
    showErrorAlert("Please enter your Roll Number.");
    rollInput.focus();
    return;
  }

  hideErrorAlert();
  btnVerify.disabled = true;
  btnVerify.innerHTML = `<span class="spinner"></span> Verifying...`;

  try {
    const res = await API.getStudentDetails(rollNumber);

    if (!res.success) {
      showErrorAlert(res.message || "Invalid roll number. Please check your roll number.");
      resetVerificationState();
      return;
    }

    // Success - Verified student
    verifiedStudent = res.data;
    renderVerifiedStudent(verifiedStudent);
    showToast(`Welcome, ${verifiedStudent.studentName}!`, "success");

  } catch (err) {
    showErrorAlert("Verification failed due to a network error. Please try again.");
  } finally {
    btnVerify.disabled = false;
    btnVerify.innerHTML = `Verify Roll Number`;
  }
}

/**
 * Display Verified Student UI
 */
function renderVerifiedStudent(student) {
  const verifiedBanner = document.getElementById("verifiedBanner");
  const verifiedName = document.getElementById("verifiedStudentName");
  const verifiedRoll = document.getElementById("verifiedRollNumber");
  const stepVerification = document.getElementById("stepVerification");

  verifiedName.textContent = student.studentName;
  verifiedRoll.textContent = `Roll No: ${student.rollNumber}`;
  verifiedBanner.style.display = "flex";

  updateSubmitButtonState();
}

/**
 * Reset Verification
 */
function resetVerificationState() {
  verifiedStudent = null;
  const verifiedBanner = document.getElementById("verifiedBanner");
  if (verifiedBanner) verifiedBanner.style.display = "none";
  updateSubmitButtonState();
}

/**
 * Update Submit Attendance Button State
 */
function updateSubmitButtonState() {
  const btnSubmit = document.getElementById("btnSubmitAttendance");
  if (!btnSubmit) return;

  const isPortalOpen = currentStatusData && currentStatusData.isAttendanceOpen;
  const isVerified = verifiedStudent !== null;

  if (isPortalOpen && isVerified) {
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = `<span>MARK ATTENDANCE</span> ➔`;
  } else {
    btnSubmit.disabled = true;
    if (!isVerified) {
      btnSubmit.innerHTML = `<span>Verify Roll Number First</span>`;
    } else if (!isPortalOpen) {
      btnSubmit.innerHTML = `<span>Attendance Is Currently Closed</span>`;
    }
  }
}

/**
 * Handle Attendance Submission
 */
async function handleSubmitAttendance() {
  if (!verifiedStudent) {
    showErrorAlert("Please verify your roll number first.");
    return;
  }

  if (!currentStatusData || !currentStatusData.isAttendanceOpen) {
    showErrorAlert("Attendance submission is currently closed.");
    return;
  }

  const btnSubmit = document.getElementById("btnSubmitAttendance");
  const attendanceBox = document.getElementById("attendanceBox");
  const successCard = document.getElementById("submissionSuccessCard");

  btnSubmit.disabled = true;
  btnSubmit.innerHTML = `<span class="spinner"></span> Submitting Attendance...`;
  hideErrorAlert();

  try {
    const res = await API.submitAttendance(
      verifiedStudent.rollNumber,
      currentStatusData.activeClassId
    );

    if (!res.success) {
      if (res.data && res.data.alreadySubmitted) {
        showErrorAlert("You have already marked your attendance for this class.");
        showToast("Attendance already recorded.", "warning");
      } else {
        showErrorAlert(res.message || "Failed to submit attendance. Please try again.");
      }
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = `<span>MARK ATTENDANCE</span> ➔`;
      return;
    }

    // Attendance successfully recorded!
    attendanceBox.style.display = "none";
    successCard.style.display = "block";

    document.getElementById("receiptAttId").textContent = res.data.attendanceId;
    document.getElementById("receiptStudentName").textContent = res.data.studentName;
    document.getElementById("receiptRoll").textContent = res.data.rollNumber;
    document.getElementById("receiptClassName").textContent = res.data.className;
    document.getElementById("receiptTime").textContent = res.data.submissionTime;

    showToast("Attendance submitted successfully!", "success");

  } catch (err) {
    showErrorAlert(
      "Submission failed: " +
      (err.message || "Network or server error. Please try again.")
    );
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = `<span>MARK ATTENDANCE</span> ➔`;
  }
}

function showErrorAlert(msg) {
  const alertEl = document.getElementById("studentErrorAlert");
  if (alertEl) {
    alertEl.textContent = msg;
    alertEl.style.display = "block";
  }
}

function hideErrorAlert() {
  const alertEl = document.getElementById("studentErrorAlert");
  if (alertEl) {
    alertEl.style.display = "none";
  }
}

function renderUnconfiguredNotice() {
  const statusMsg = document.getElementById("statusMessage");
  const statusTitle = document.getElementById("statusTitle");
  if (statusTitle) statusTitle.textContent = "Setup Required";
  if (statusMsg) {
    statusMsg.innerHTML = `
      Please connect your Google Apps Script Web App URL in <a href="admin-login.html" style="text-decoration: underline;">Admin Settings</a> or configure <code>js/config.js</code>.
    `;
  }
}

