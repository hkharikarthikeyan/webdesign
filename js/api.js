/**
 * ============================================================================
 * CENTRALIZED STUDENT ATTENDANCE MANAGEMENT SYSTEM - API CLIENT
 * ============================================================================
 * Handles all network requests to the Google Apps Script Web App API.
 * Uses robust CORS-safe POST requests with text/plain body format.
 */

const API = {
  /**
   * Universal API call method
   * @param {string} action - API operation name
   * @param {object} payload - Request parameters
   * @returns {Promise<object>} - Response object { success, message, data }
   */
  async request(action, payload = {}) {
    const apiUrl = CONFIG.API_BASE_URL;

    if (!apiUrl || apiUrl.includes("YOUR_DEPLOYED_APPS_SCRIPT_URL_HERE")) {
      const err = "Apps Script API URL is not configured. Please set the Web App URL in settings.";
      console.warn(err);
      return {
        success: false,
        message: err,
        data: null,
        unconfigured: true
      };
    }

    // Attach admin session token automatically if available
    const token = localStorage.getItem(CONFIG.STORAGE_KEYS.ADMIN_TOKEN);
    const bodyData = {
      action: action,
      sessionToken: token || "",
      ...payload
    };

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        mode: "cors",
        redirect: "follow",
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify(bodyData)
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
      }

      const json = await response.json();
      return json;

    } catch (error) {
      console.error(`API Error on action "${action}":`, error);
      return {
        success: false,
        message: "Network or Server Error: " + error.message,
        data: null,
        error: error
      };
    }
  },

  /* ------------------------------------------------------------------------
   * Public Student Endpoints
   * ------------------------------------------------------------------------ */

  /**
   * Get attendance status, active class, and authoritative server time
   */
  async getAttendanceStatus() {
    return this.request("getAttendanceStatus");
  },

  /**
   * Verify roll number against Students worksheet
   */
  async getStudentDetails(rollNumber) {
    return this.request("getStudentDetails", { rollNumber: rollNumber.trim() });
  },

  /**
   * Submit attendance for current active class
   */
  async submitAttendance(rollNumber, classId) {
    return this.request("submitAttendance", {
      rollNumber: rollNumber.trim(),
      classId: classId
    });
  },

  /* ------------------------------------------------------------------------
   * Admin Authentication Endpoints
   * ------------------------------------------------------------------------ */

  async adminLogin(username, password) {
    return this.request("adminLogin", {
      username: username,
      password: password
    });
  },

  async adminLogout() {
    return this.request("adminLogout");
  },

  async changeAdminPassword(currentPassword, newPassword) {
    return this.request("changeAdminPassword", {
      currentPassword: currentPassword,
      newPassword: newPassword
    });
  },

  /* ------------------------------------------------------------------------
   * Admin Management Endpoints
   * ------------------------------------------------------------------------ */

  async getDashboardStats() {
    return this.request("getDashboardStats");
  },

  async uploadStudents(studentsArray) {
    return this.request("uploadStudents", { students: studentsArray });
  },

  async getStudentsList() {
    return this.request("getStudentsList");
  },

  async createClass(classData) {
    return this.request("createClass", classData);
  },

  async updateClass(classData) {
    return this.request("updateClass", classData);
  },

  async getClasses() {
    return this.request("getClasses");
  },

  async enableAttendance(classId) {
    return this.request("enableAttendance", { classId: classId });
  },

  async disableAttendance() {
    return this.request("disableAttendance");
  },

  async getAttendanceRecords(filters = {}) {
    return this.request("getAttendanceRecords", filters);
  },

  async getClassAttendanceReport(classId) {
    return this.request("getClassAttendanceReport", { classId: classId });
  },

  async exportAttendanceData(type = "classReport", classId = "") {
    return this.request("exportAttendanceData", { type: type, classId: classId });
  },

  async initializeDatabase() {
    return this.request("initializeDatabase");
  }
};

