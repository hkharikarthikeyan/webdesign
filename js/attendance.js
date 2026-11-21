/**
 * ============================================================================
 * CENTRALIZED STUDENT ATTENDANCE MANAGEMENT SYSTEM - ATTENDANCE MANAGEMENT
 * ============================================================================
 * Handles attendance logs, filtering, search, class-wise reports, and absence calculation.
 */

const AttendanceManager = {
  currentRecords: [],
  currentReportData: null,
  currentReportClassInfo: null,

  /**
   * Load attendance records with optional filters
   */
  async loadAttendanceRecords() {
    const classFilter = document.getElementById("attFilterClass")?.value || "";
    const dateFilter = document.getElementById("attFilterDate")?.value || "";
    const statusFilter = document.getElementById("attFilterStatus")?.value || "";
    const searchFilter = document.getElementById("attSearchInput")?.value || "";

    const tableBody = document.getElementById("attendanceTableBody");
    if (tableBody) {
      tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 24px;"><span class="spinner spinner-dark"></span> Loading attendance records...</td></tr>`;
    }

    try {
      const res = await API.getAttendanceRecords({
        classId: classFilter,
        date: dateFilter,
        search: searchFilter
      });

      if (!res.success) {
        showToast(res.message || "Failed to load attendance records.", "error");
        return;
      }

      let records = res.data || [];
      if (statusFilter) {
        records = records.filter(r => r.status.toUpperCase() === statusFilter.toUpperCase());
      }

      this.currentRecords = records;
      this.renderAttendanceTable(records);

    } catch (err) {
      console.error("Error loading records:", err);
      showToast("Network error while loading records.", "error");
    }
  },

  /**
   * Render table rows
   */
  renderAttendanceTable(records) {
    const tableBody = document.getElementById("attendanceTableBody");
    const countEl = document.getElementById("attRecordCount");
    if (!tableBody) return;

    if (countEl) countEl.textContent = `${records.length} records`;

    if (records.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 28px; color: var(--slate-400);">No attendance records found for the selected criteria.</td></tr>`;
      return;
    }

    tableBody.innerHTML = records.map((r, i) => `
      <tr>
        <td><strong>${r.rollNumber}</strong></td>
        <td>${escapeHtml(r.studentName)}</td>
        <td>${escapeHtml(r.className)}</td>
        <td>${r.date}</td>
        <td>${r.submissionTime}</td>
        <td>
          <span class="badge ${r.status === 'PRESENT' ? 'badge-present' : 'badge-absent'}">
            ${r.status}
          </span>
        </td>
        <td><code>${r.attendanceId}</code></td>
      </tr>
    `).join("");
  },

  /**
   * Load complete class attendance report (combines registered active students and submissions)
   */
  async loadClassReport(classId) {
    if (!classId) return;

    const reportCard = document.getElementById("classReportCard");
    const reportBody = document.getElementById("classReportTableBody");
    if (!reportCard || !reportBody) return;

    reportCard.style.display = "block";
    reportBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 24px;"><span class="spinner spinner-dark"></span> Generating class report...</td></tr>`;

    try {
      const res = await API.getClassAttendanceReport(classId);

      if (!res.success) {
        showToast(res.message || "Failed to generate class report.", "error");
        reportCard.style.display = "none";
        return;
      }

      const data = res.data;
      this.currentReportData = data.report;
      this.currentReportClassInfo = data.classInfo;

      // Update Report Header & Stats
      document.getElementById("reportClassName").textContent = data.classInfo.className;
      document.getElementById("reportClassDate").textContent = data.classInfo.classDate;
      document.getElementById("reportTotalStudents").textContent = data.totalStudents;
      document.getElementById("reportPresentCount").textContent = data.presentCount;
      document.getElementById("reportAbsentCount").textContent = data.absentCount;
      document.getElementById("reportPercentage").textContent = `${data.attendancePercentage}%`;

      // Render table
      if (data.report.length === 0) {
        reportBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 20px;">No registered active students found.</td></tr>`;
        return;
      }

      reportBody.innerHTML = data.report.map((row, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td><strong>${row.rollNumber}</strong></td>
          <td>${escapeHtml(row.studentName)}</td>
          <td>${row.time}</td>
          <td>
            <span class="badge ${row.status === 'PRESENT' ? 'badge-present' : 'badge-absent'}">
              ${row.status}
            </span>
          </td>
          <td><code>${row.attendanceId}</code></td>
        </tr>
      `).join("");

    } catch (err) {
      console.error("Error loading class report:", err);
      showToast("Network error generating class report.", "error");
    }
  }
};

function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

