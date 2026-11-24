/**
 * ============================================================================
 * CENTRALIZED STUDENT ATTENDANCE MANAGEMENT SYSTEM - GOOGLE APPS SCRIPT API
 * ============================================================================
 * Authoritative backend running on Google Apps Script.
 * Single source of truth: Google Spreadsheet with 4 worksheets:
 * 1. Students
 * 2. Classes
 * 3. Attendance
 * 4. Settings
 *
 * Authoritative Timezone: Asia/Kolkata (IST)
 * Concurrency Protection: LockService
 * Admin Authorization: Token-based session validation via ScriptProperties
 * ============================================================================
 */

// Configuration Constants
var TIMEZONE = "Asia/Kolkata";
var SHEET_STUDENTS = "Students";
var SHEET_CLASSES = "Classes";
var SHEET_ATTENDANCE = "Attendance";
var SHEET_SETTINGS = "Settings";

// Session Duration (8 hours in milliseconds)
var SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

/**
 * Main Web App Entry Points
 */
function doGet(e) {
  return handleRequest(e, "GET");
}

function doPost(e) {
  return handleRequest(e, "POST");
}

/**
 * Universal Request Handler supporting both GET and POST with CORS support
 */
function handleRequest(e, method) {
  try {
    var params = {};

    if (e && e.parameter) {
      params = Object.assign({}, e.parameter);
    }

    if (e && e.postData && e.postData.contents) {
      try {
        var postJson = JSON.parse(e.postData.contents);
        params = Object.assign(params, postJson);
      } catch (parseErr) {
        // Fallback for form-encoded or raw query
        if (e.parameter) {
          params = Object.assign(params, e.parameter);
        }
      }
    }

    var action = params.action;
    if (!action) {
      return jsonResponse(false, "No action specified.", null);
    }

    // Route requests
    switch (action) {
      // Public Endpoints
      case "getAttendanceStatus":
        return getAttendanceStatus(params);
      case "getStudentDetails":
        return getStudentDetails(params);
      case "submitAttendance":
        return submitAttendance(params);
      case "adminLogin":
        return adminLogin(params);

      // Protected Admin Endpoints
      case "adminLogout":
        return requireAuth(params, adminLogout);
      case "getDashboardStats":
        return requireAuth(params, getDashboardStats);
      case "uploadStudents":
        return requireAuth(params, uploadStudents);
      case "getStudentsList":
        return requireAuth(params, getStudentsList);
      case "createClass":
        return requireAuth(params, createClass);
      case "updateClass":
        return requireAuth(params, updateClass);
      case "getClasses":
        return requireAuth(params, getClasses);
      case "enableAttendance":
        return requireAuth(params, enableAttendance);
      case "disableAttendance":
        return requireAuth(params, disableAttendance);
      case "getAttendanceRecords":
        return requireAuth(params, getAttendanceRecords);
      case "getClassAttendanceReport":
        return requireAuth(params, getClassAttendanceReport);
      case "exportAttendanceData":
        return requireAuth(params, exportAttendanceData);
      case "changeAdminPassword":
        return requireAuth(params, changeAdminPassword);
      case "initializeDatabase":
        return jsonResponse(true, "Database initialized", setupDatabase());

      default:
        return jsonResponse(false, "Unknown action: " + action, null);
    }
  } catch (err) {
    return jsonResponse(false, "Server Exception: " + err.toString(), null);
  }
}

/**
 * Helper to produce standard JSON output with CORS headers
 */
function jsonResponse(success, message, data) {
  var output = {
    success: success,
    message: message || (success ? "Success" : "Failed"),
    data: data !== undefined ? data : null,
    serverTime: getServerTimestamp(),
    timeZone: TIMEZONE
  };

  return ContentService.createTextOutput(JSON.stringify(output))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Protect admin actions with session token check
 */
function requireAuth(params, handlerFunction) {
  var token = params.sessionToken || params.token;
  if (!token) {
    return jsonResponse(false, "Unauthorized: Session token missing.", null);
  }

  var auth = validateAdminSession(token);
  if (!auth.valid) {
    return jsonResponse(false, "Unauthorized: " + auth.reason, null);
  }

  return handlerFunction(params);
}

/**
 * Validate Admin Session Token from ScriptProperties
 */
function validateAdminSession(token) {
  var props = PropertiesService.getScriptProperties();
  var sessions = getAdminSessions();
  var session = sessions[token];

  if (!session) {
    return { valid: false, reason: "Invalid session token. Please log in again." };
  }

  var expiry = parseInt(session.expiresAt, 10);
  var now = new Date().getTime();
  if (isNaN(expiry) || now > expiry) {
    delete sessions[token];
    props.setProperty("ADMIN_SESSIONS", JSON.stringify(sessions));
    return { valid: false, reason: "Session expired. Please log in again." };
  }

  return { valid: true, username: session.username };
}

function getAdminSessions() {
  var raw = PropertiesService.getScriptProperties().getProperty("ADMIN_SESSIONS");
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch (err) {
    return {};
  }
}

/**
 * Initialize / Get active Spreadsheet instance
 */
function getSpreadsheet() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * Get or create worksheet by name
 */
function getOrCreateSheet(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (headers && headers.length > 0) {
      sheet.appendRow(headers);
      var headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setFontWeight("bold");
      headerRange.setBackground("#1E293B");
      headerRange.setFontColor("#FFFFFF");
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

/**
 * Set up initial database sheets and settings if not present
 */
function setupDatabase() {
  var ss = getSpreadsheet();

  // 1. Students Sheet
  var studentsSheet = getOrCreateSheet(ss, SHEET_STUDENTS, [
    "Roll Number", "Student Name", "Email", "Status"
  ]);

  // 2. Classes Sheet
  var classesSheet = getOrCreateSheet(ss, SHEET_CLASSES, [
    "Class ID", "Class Name", "Class Date", "Start Time", "End Time", "Opening Time", "Closing Time", "Admin Status"
  ]);

  // 3. Attendance Sheet
  var attendanceSheet = getOrCreateSheet(ss, SHEET_ATTENDANCE, [
    "Attendance ID", "Class ID", "Roll Number", "Student Name", "Date", "Submission Time", "Status"
  ]);

  // 4. Settings Sheet
  var settingsSheet = getOrCreateSheet(ss, SHEET_SETTINGS, [
    "Setting Key", "Setting Value", "Description", "Last Updated"
  ]);

  // Ensure default Settings rows exist
  ensureSetting(settingsSheet, "portalStatus", "DISABLED", "Overall Attendance Portal Status (ENABLED/DISABLED)");
  ensureSetting(settingsSheet, "activeClassId", "", "Current Active Class ID for Attendance");
  ensureSetting(settingsSheet, "systemName", "Centralized Student Attendance System", "Application Name");

  // Initialize the multi-admin account list if it does not exist.
  initializeAdminAccounts();

  return {
    status: "Database initialized successfully",
    sheets: [SHEET_STUDENTS, SHEET_CLASSES, SHEET_ATTENDANCE, SHEET_SETTINGS]
  };
}

function ensureSetting(settingsSheet, key, defaultValue, description) {
  var data = settingsSheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      return; // Already exists
    }
  }
  settingsSheet.appendRow([key, defaultValue, description, getServerTimestamp()]);
}

/**
 * Settings helpers
 */
function getSetting(key) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_SETTINGS);
  if (!sheet) return null;

  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === key) {
      return String(data[i][1]).trim();
    }
  }
  return null;
}

function setSetting(key, value) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_SETTINGS);
  if (!sheet) {
    setupDatabase();
    sheet = ss.getSheetByName(SHEET_SETTINGS);
  }

  var data = sheet.getDataRange().getValues();
  var updated = false;
  var timestamp = getServerTimestamp();

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      sheet.getRange(i + 1, 4).setValue(timestamp);
      updated = true;
      break;
    }
  }

  if (!updated) {
    sheet.appendRow([key, value, "", timestamp]);
  }
}

/**
 * Time and Date Utilities using authoritative Asia/Kolkata timezone
 */
function getServerNow() {
  return new Date();
}

function getServerTimestamp() {
  return Utilities.formatDate(getServerNow(), TIMEZONE, "yyyy-MM-dd HH:mm:ss");
}

function getServerDateString() {
  return Utilities.formatDate(getServerNow(), TIMEZONE, "yyyy-MM-dd");
}

function getServerTimeString() {
  return Utilities.formatDate(getServerNow(), TIMEZONE, "HH:mm");
}

/**
 * Convert time string (e.g. "19:00", "7:00 PM", "07:15") into total minutes from 00:00
 */
function parseTimeToMinutes(timeStr) {
  if (!timeStr) return -1;

  if (timeStr instanceof Date) {
    var dateTime = Utilities.formatDate(timeStr, TIMEZONE, "HH:mm");
    return parseTimeToMinutes(dateTime);
  }

  if (typeof timeStr === "number") {
    var numericMinutes = Math.round(timeStr * 24 * 60);
    if (numericMinutes >= 0 && numericMinutes < 1440) {
      return numericMinutes;
    }
  }

  var str = String(timeStr).trim().toUpperCase();

  var isPM = str.indexOf("PM") > -1;
  var isAM = str.indexOf("AM") > -1;

  str = str.replace(/AM|PM/g, "").trim();
  var parts = str.split(":");
  if (parts.length < 2) return -1;

  var hours = parseInt(parts[0], 10);
  var minutes = parseInt(parts[1], 10);

  if (isNaN(hours) || isNaN(minutes)) return -1;

  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

function normalizeTimeString(timeVal) {
  var minutes = parseTimeToMinutes(timeVal);
  if (minutes < 0) return "";

  var hours = Math.floor(minutes / 60);
  var mins = minutes % 60;
  return (hours < 10 ? "0" : "") + hours + ":" +
    (mins < 10 ? "0" : "") + mins;
}

/**
 * Normalize Date to "YYYY-MM-DD"
 */
function normalizeDateString(dateVal) {
  if (!dateVal) return "";
  if (dateVal instanceof Date) {
    return Utilities.formatDate(dateVal, TIMEZONE, "yyyy-MM-dd");
  }
  var str = String(dateVal).trim();
  // If format is like "2026-11-15T..." or "2026-11-15"
  if (str.match(/^\d{4}-\d{2}-\d{2}/)) {
    return str.substring(0, 10);
  }
  // Try parsing
  var parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, TIMEZONE, "yyyy-MM-dd");
  }
  return str;
}

/**
 * ============================================================================
 * ADMIN AUTHENTICATION
 * ============================================================================
 */
function hashPassword(password) {
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(password),
    Utilities.Charset.UTF_8
  );

  return digest.map(function (byte) {
    var hex = (byte & 0xff).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  }).join("");
}

function initializeAdminAccounts() {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty("ADMINS_JSON");
  var admins = [];

  if (raw) {
    try {
      admins = JSON.parse(raw);
      if (!Array.isArray(admins)) admins = [];
    } catch (err) {
      admins = [];
    }
  } else {
    var legacyUsername = String(props.getProperty("ADMIN_USERNAME") || "admin").trim();
    var legacyPassword = String(props.getProperty("ADMIN_PASSWORD") || "Admin@1234").trim();
    admins.push({
      username: legacyUsername,
      passwordHash: hashPassword(legacyPassword),
      active: true
    });
  }

  var defaultAccounts = [
    { username: "Sanjay", password: "sanjay@123" },
    { username: "Vasanth", password: "Vasanth@123" }
  ];

  defaultAccounts.forEach(function (account) {
    var exists = admins.some(function (admin) {
      return String(admin.username).trim().toLowerCase() === account.username.toLowerCase();
    });

    if (!exists) {
      admins.push({
        username: account.username,
        passwordHash: hashPassword(account.password),
        active: true
      });
    }
  });

  props.setProperty("ADMINS_JSON", JSON.stringify(admins));
  props.deleteProperty("ADMIN_USERNAME");
  props.deleteProperty("ADMIN_PASSWORD");
  props.deleteProperty("ADMIN_SESSION_TOKEN");
  props.deleteProperty("ADMIN_SESSION_EXPIRY");
}

function getAdminAccounts() {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty("ADMINS_JSON");
  if (!raw) {
    initializeAdminAccounts();
    raw = props.getProperty("ADMINS_JSON");
  }

  try {
    return JSON.parse(raw);
  } catch (err) {
    return [];
  }
}

function adminLogin(params) {
  var username = String(params.username || "").trim();
  var password = String(params.password || "").trim();

  if (!username || !password) {
    return jsonResponse(false, "Username and password are required.", null);
  }

  var props = PropertiesService.getScriptProperties();
  var passwordHash = hashPassword(password);
  var admin = null;
  var admins = getAdminAccounts();

  for (var i = 0; i < admins.length; i++) {
    if (
      String(admins[i].username).trim().toLowerCase() === username.toLowerCase() &&
      admins[i].passwordHash === passwordHash &&
      admins[i].active !== false
    ) {
      admin = admins[i];
      break;
    }
  }

  if (!admin) {
    return jsonResponse(false, "Invalid username or password.", null);
  }

  // Generate secure random session token
  var token = Utilities.getUuid() + "-" + new Date().getTime();
  var expiry = new Date().getTime() + SESSION_DURATION_MS;
  var sessions = getAdminSessions();
  sessions[token] = {
    username: admin.username,
    expiresAt: expiry
  };
  props.setProperty("ADMIN_SESSIONS", JSON.stringify(sessions));

  return jsonResponse(true, "Login successful.", {
    sessionToken: token,
    expiresAt: expiry,
    username: username
  });
}

function adminLogout(params) {
  var props = PropertiesService.getScriptProperties();
  var token = params.sessionToken || params.token;
  var sessions = getAdminSessions();
  if (token && sessions[token]) {
    delete sessions[token];
    props.setProperty("ADMIN_SESSIONS", JSON.stringify(sessions));
  }
  return jsonResponse(true, "Logged out successfully.", null);
}

function changeAdminPassword(params) {
  var currentPassword = String(params.currentPassword || "").trim();
  var newPassword = String(params.newPassword || "").trim();

  if (!newPassword || newPassword.length < 6) {
    return jsonResponse(false, "New password must be at least 6 characters long.", null);
  }

  var props = PropertiesService.getScriptProperties();
  var token = params.sessionToken || params.token;
  var sessions = getAdminSessions();
  var session = sessions[token];
  if (!session) {
    return jsonResponse(false, "Unauthorized session.", null);
  }

  var admins = getAdminAccounts();
  var adminIndex = -1;
  var currentHash = hashPassword(currentPassword);

  for (var i = 0; i < admins.length; i++) {
    if (
      String(admins[i].username).trim().toLowerCase() === String(session.username).trim().toLowerCase()
    ) {
      adminIndex = i;
      break;
    }
  }

  if (
    adminIndex === -1 ||
    admins[adminIndex].passwordHash !== currentHash
  ) {
    return jsonResponse(false, "Current password does not match.", null);
  }

  admins[adminIndex].passwordHash = hashPassword(newPassword);
  props.setProperty("ADMINS_JSON", JSON.stringify(admins));
  return jsonResponse(true, "Password updated successfully.", null);
}

/**
 * ============================================================================
 * DASHBOARD & STATISTICS
 * ============================================================================
 */
function getDashboardStats(params) {
  var ss = getSpreadsheet();
  var studentsSheet = ss.getSheetByName(SHEET_STUDENTS);
  var classesSheet = ss.getSheetByName(SHEET_CLASSES);
  var attendanceSheet = ss.getSheetByName(SHEET_ATTENDANCE);

  var totalStudents = 0;
  var activeStudents = 0;
  if (studentsSheet && studentsSheet.getLastRow() > 1) {
    var studentData = studentsSheet.getDataRange().getValues();
    for (var i = 1; i < studentData.length; i++) {
      if (String(studentData[i][0]).trim() !== "") {
        totalStudents++;
        var status = String(studentData[i][3] || "").trim().toUpperCase();
        if (status === "ACTIVE" || status === "") {
          activeStudents++;
        }
      }
    }
  }

  var totalClasses = 0;
  if (classesSheet && classesSheet.getLastRow() > 1) {
    totalClasses = classesSheet.getLastRow() - 1;
  }

  var portalStatus = getSetting("portalStatus") || "DISABLED";
  var activeClassId = getSetting("activeClassId") || "";
  var currentClass = null;

  if (activeClassId && classesSheet && classesSheet.getLastRow() > 1) {
    var classData = classesSheet.getDataRange().getValues();
    for (var j = 1; j < classData.length; j++) {
      if (String(classData[j][0]).trim() === activeClassId) {
        currentClass = {
          classId: classData[j][0],
          className: classData[j][1],
          classDate: normalizeDateString(classData[j][2]),
          startTime: classData[j][3],
          endTime: classData[j][4],
          openingTime: classData[j][5],
          closingTime: classData[j][6],
          adminStatus: classData[j][7]
        };
        break;
      }
    }
  }

  // Calculate attendance for current active class or latest class
  var presentCount = 0;
  var absentCount = 0;
  var attendancePercentage = 0;

  var targetClassId = activeClassId;
  if (!targetClassId && classesSheet && classesSheet.getLastRow() > 1) {
    // Pick the most recent class if no active class
    var latestRow = classesSheet.getRange(classesSheet.getLastRow(), 1, 1, 8).getValues()[0];
    targetClassId = latestRow[0];
  }

  if (targetClassId && attendanceSheet && attendanceSheet.getLastRow() > 1) {
    var attData = attendanceSheet.getDataRange().getValues();
    var countedRolls = {};
    for (var k = 1; k < attData.length; k++) {
      if (String(attData[k][1]).trim() === targetClassId) {
        var roll = String(attData[k][2]).trim();
        if (!countedRolls[roll]) {
          countedRolls[roll] = true;
          presentCount++;
        }
      }
    }
  }

  if (activeStudents > 0) {
    absentCount = Math.max(0, activeStudents - presentCount);
    attendancePercentage = Math.round((presentCount / activeStudents) * 100);
  }

  return jsonResponse(true, "Dashboard stats fetched successfully", {
    totalStudents: totalStudents,
    activeStudents: activeStudents,
    totalClasses: totalClasses,
    presentStudents: presentCount,
    absentStudents: absentCount,
    attendancePercentage: attendancePercentage,
    portalStatus: portalStatus,
    activeClassId: activeClassId,
    currentClass: currentClass,
    serverTime: getServerTimestamp(),
    serverDate: getServerDateString()
  });
}

/**
 * ============================================================================
 * STUDENT MANAGEMENT
 * ============================================================================
 */

/**
 * Upload & Replace / Update Students from Excel / SheetJS payload
 */
function uploadStudents(params) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    return jsonResponse(false, "Server is currently busy. Please try again.", null);
  }

  try {
    var students = params.students;
    if (!students || !Array.isArray(students) || students.length === 0) {
      return jsonResponse(false, "No valid student data provided.", null);
    }

    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_STUDENTS);
    if (!sheet) {
      setupDatabase();
      sheet = ss.getSheetByName(SHEET_STUDENTS);
    }

    var existingData = sheet.getDataRange().getValues();
    var studentMap = {}; // rollNumber -> row index (1-based)

    for (var i = 1; i < existingData.length; i++) {
      var existingRoll = String(existingData[i][0]).trim().toUpperCase();
      if (existingRoll) {
        studentMap[existingRoll] = i + 1;
      }
    }

    var successCount = 0;
    var updatedCount = 0;
    var failedRecords = [];
    var seenInUpload = {};

    for (var s = 0; s < students.length; s++) {
      var item = students[s];
      var rollNumber = String(item.rollNumber || item["Roll Number"] || item.roll_number || "").trim();
      var studentName = String(item.studentName || item["Student Name"] || item.name || "").trim();
      var email = String(item.email || item.Email || "").trim();
      var status = String(item.status || item.Status || "ACTIVE").trim().toUpperCase();

      if (!rollNumber) {
        failedRecords.push({ row: s + 1, reason: "Missing Roll Number", data: item });
        continue;
      }
      if (!studentName) {
        failedRecords.push({ row: s + 1, rollNumber: rollNumber, reason: "Missing Student Name", data: item });
        continue;
      }

      var upperRoll = rollNumber.toUpperCase();
      if (seenInUpload[upperRoll]) {
        failedRecords.push({ row: s + 1, rollNumber: rollNumber, reason: "Duplicate roll number in uploaded file", data: item });
        continue;
      }
      seenInUpload[upperRoll] = true;

      if (studentMap[upperRoll]) {
        // Update existing row
        var rowIdx = studentMap[upperRoll];
        sheet.getRange(rowIdx, 1, 1, 4).setValues([[
          rollNumber,
          studentName,
          email || sheet.getRange(rowIdx, 3).getValue(),
          status || "ACTIVE"
        ]]);
        updatedCount++;
      } else {
        // Append new student
        sheet.appendRow([rollNumber, studentName, email, status || "ACTIVE"]);
        studentMap[upperRoll] = sheet.getLastRow();
        successCount++;
      }
    }

    return jsonResponse(true, "Student records processed successfully.", {
      addedCount: successCount,
      updatedCount: updatedCount,
      failedCount: failedRecords.length,
      failedRecords: failedRecords
    });
  } catch (err) {
    return jsonResponse(false, "Failed to upload students: " + err.toString(), null);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Get public Student Name verification for attendance portal
 * Does NOT expose full student list or sensitive emails!
 */
function getStudentDetails(params) {
  var rollNumber = String(params.rollNumber || "").trim().toUpperCase();
  if (!rollNumber) {
    return jsonResponse(false, "Please provide a valid Roll Number.", null);
  }

  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_STUDENTS);
  if (!sheet || sheet.getLastRow() <= 1) {
    return jsonResponse(false, "No students are currently registered in the system.", null);
  }

  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var rowRoll = String(data[i][0]).trim().toUpperCase();
    if (rowRoll === rollNumber) {
      var studentName = String(data[i][1]).trim();
      var status = String(data[i][3] || "ACTIVE").trim().toUpperCase();

      if (status !== "ACTIVE" && status !== "") {
        return jsonResponse(false, "Student account is inactive. Please contact the administrator.", {
          rollNumber: data[i][0],
          studentName: studentName,
          status: status
        });
      }

      return jsonResponse(true, "Student verified successfully.", {
        rollNumber: data[i][0],
        studentName: studentName,
        status: "ACTIVE"
      });
    }
  }

  return jsonResponse(false, "Invalid roll number. Please check your roll number.", null);
}

/**
 * Get all students for admin dashboard
 */
function getStudentsList(params) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_STUDENTS);
  if (!sheet || sheet.getLastRow() <= 1) {
    return jsonResponse(true, "No students found.", []);
  }

  var data = sheet.getDataRange().getValues();
  var list = [];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() !== "") {
      list.push({
        rollNumber: data[i][0],
        studentName: data[i][1],
        email: data[i][2],
        status: data[i][3] || "ACTIVE"
      });
    }
  }

  return jsonResponse(true, "Students list retrieved.", list);
}

/**
 * ============================================================================
 * CLASS SCHEDULE MANAGEMENT
 * ============================================================================
 */

/**
 * Create a new class schedule with strict time validations
 */
function createClass(params) {
  var className = String(params.className || "").trim();
  var classDate = normalizeDateString(params.classDate);
  var startTime = normalizeTimeString(params.startTime);
  var endTime = normalizeTimeString(params.endTime);
  var openingTime = normalizeTimeString(params.openingTime);
  var closingTime = normalizeTimeString(params.closingTime);

  // Validations
  if (!className) {
    return jsonResponse(false, "Class Name is mandatory.", null);
  }
  if (!classDate) {
    return jsonResponse(false, "Class Date is mandatory and must be valid.", null);
  }
  if (!startTime || !endTime || !openingTime || !closingTime) {
    return jsonResponse(false, "Start Time, End Time, Opening Time, and Closing Time are all mandatory.", null);
  }

  var startMin = parseTimeToMinutes(startTime);
  var endMin = parseTimeToMinutes(endTime);
  var openMin = parseTimeToMinutes(openingTime);
  var closeMin = parseTimeToMinutes(closingTime);

  if (startMin < 0 || endMin < 0 || openMin < 0 || closeMin < 0) {
    return jsonResponse(false, "Invalid time format provided. Please use standard HH:mm or HH:mm AM/PM.", null);
  }

  if (startMin >= endMin) {
    return jsonResponse(false, "Class Start Time must be earlier than End Time.", null);
  }
  if (openMin < startMin) {
    return jsonResponse(false, "Attendance Opening Time must not be before the Class Start Time.", null);
  }
  if (closeMin <= openMin) {
    return jsonResponse(false, "Attendance Closing Time must be after the Opening Time.", null);
  }
  if (closeMin > endMin) {
    return jsonResponse(false, "Attendance Closing Time must not exceed the Class End Time.", null);
  }

  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_CLASSES);
  if (!sheet) {
    setupDatabase();
    sheet = ss.getSheetByName(SHEET_CLASSES);
  }

  // Generate unique class ID: CLS-YYYYMMDD-XXX
  var dateClean = classDate.replace(/-/g, "");
  var randomCode = Math.floor(100 + Math.random() * 900);
  var classId = "CLS-" + dateClean + "-" + randomCode;

  var newRow = [
    classId,
    className,
    classDate,
    startTime,
    endTime,
    openingTime,
    closingTime,
    "SCHEDULED"
  ];

  sheet.appendRow(newRow);

  return jsonResponse(true, "Class created successfully.", {
    classId: classId,
    className: className,
    classDate: classDate,
    startTime: startTime,
    endTime: endTime,
    openingTime: openingTime,
    closingTime: closingTime,
    adminStatus: "SCHEDULED"
  });
}

/**
 * Update an existing class before attendance starts
 */
function updateClass(params) {
  var classId = String(params.classId || "").trim();
  if (!classId) {
    return jsonResponse(false, "Class ID is required.", null);
  }

  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_CLASSES);
  if (!sheet || sheet.getLastRow() <= 1) {
    return jsonResponse(false, "Class not found.", null);
  }

  var data = sheet.getDataRange().getValues();
  var rowIndex = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === classId) {
      rowIndex = i + 1;
      break;
    }
  }

  if (rowIndex === -1) {
    return jsonResponse(false, "Class with ID " + classId + " not found.", null);
  }

  var className = String(params.className || data[rowIndex - 1][1]).trim();
  var classDate = normalizeDateString(params.classDate || data[rowIndex - 1][2]);
  var startTime = normalizeTimeString(params.startTime || data[rowIndex - 1][3]);
  var endTime = normalizeTimeString(params.endTime || data[rowIndex - 1][4]);
  var openingTime = normalizeTimeString(params.openingTime || data[rowIndex - 1][5]);
  var closingTime = normalizeTimeString(params.closingTime || data[rowIndex - 1][6]);

  var startMin = parseTimeToMinutes(startTime);
  var endMin = parseTimeToMinutes(endTime);
  var openMin = parseTimeToMinutes(openingTime);
  var closeMin = parseTimeToMinutes(closingTime);

  if (startMin >= endMin || openMin < startMin || closeMin <= openMin || closeMin > endMin) {
    return jsonResponse(false, "Invalid time constraints. Please verify times.", null);
  }

  sheet.getRange(rowIndex, 2, 1, 6).setValues([[
    className,
    classDate,
    startTime,
    endTime,
    openingTime,
    closingTime
  ]]);

  return jsonResponse(true, "Class updated successfully.", { classId: classId });
}

/**
 * Get all classes for admin view
 */
function getClasses(params) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_CLASSES);
  if (!sheet || sheet.getLastRow() <= 1) {
    return jsonResponse(true, "No classes found.", []);
  }

  var data = sheet.getDataRange().getValues();
  var list = [];
  var activeClassId = getSetting("activeClassId") || "";

  for (var i = 1; i < data.length; i++) {
    var cId = String(data[i][0]).trim();
    if (cId) {
      list.push({
        classId: cId,
        className: data[i][1],
        classDate: normalizeDateString(data[i][2]),
        startTime: data[i][3],
        endTime: data[i][4],
        openingTime: data[i][5],
        closingTime: data[i][6],
        adminStatus: data[i][7] || "SCHEDULED",
        isActive: cId === activeClassId
      });
    }
  }

  // Sort descending by date
  list.sort(function(a, b) {
    return (b.classDate + b.startTime).localeCompare(a.classDate + a.startTime);
  });

  return jsonResponse(true, "Classes retrieved.", list);
}

/**
 * ============================================================================
 * ADMIN ATTENDANCE CONTROLS (ENABLE / DISABLE)
 * ============================================================================
 */

/**
 * Enable Attendance for a specific Class ID
 * Admin cannot enable attendance outside configured attendance window
 */
function enableAttendance(params) {
  var classId = String(params.classId || "").trim();
  if (!classId) {
    return jsonResponse(false, "Please select a Class ID to enable attendance.", null);
  }

  var ss = getSpreadsheet();
  var classesSheet = ss.getSheetByName(SHEET_CLASSES);
  if (!classesSheet || classesSheet.getLastRow() <= 1) {
    return jsonResponse(false, "No classes found.", null);
  }

  var data = classesSheet.getDataRange().getValues();
  var classRow = null;
  var rowIndex = -1;

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === classId) {
      classRow = data[i];
      rowIndex = i + 1;
      break;
    }
  }

  if (!classRow) {
    return jsonResponse(false, "Class ID " + classId + " does not exist.", null);
  }

  var classDate = normalizeDateString(classRow[2]);
  var openingTime = normalizeTimeString(classRow[5]);
  var closingTime = normalizeTimeString(classRow[6]);

  var serverDate = getServerDateString();
  var serverTime = getServerTimeString();

  // Validate Date matches today
  if (classDate !== serverDate) {
    return jsonResponse(false, "Cannot enable attendance: Class date (" + classDate + ") does not match server date (" + serverDate + ").", null);
  }

  var curMinutes = parseTimeToMinutes(serverTime);
  var openMinutes = parseTimeToMinutes(openingTime);
  var closeMinutes = parseTimeToMinutes(closingTime);

  if (curMinutes < openMinutes) {
    return jsonResponse(false, "Cannot enable attendance before opening time (" + openingTime + "). Server time: " + serverTime, null);
  }

  if (curMinutes >= closeMinutes) {
    return jsonResponse(false, "Cannot enable attendance after closing time (" + closingTime + "). Server time: " + serverTime, null);
  }

  // Set central settings
  setSetting("portalStatus", "ENABLED");
  setSetting("activeClassId", classId);

  // Update Class Admin Status
  classesSheet.getRange(rowIndex, 8).setValue("ENABLED");

  return jsonResponse(true, "Attendance ENABLED for class: " + classRow[1], {
    classId: classId,
    className: classRow[1],
    portalStatus: "ENABLED"
  });
}

/**
 * Disable Attendance immediately
 */
function disableAttendance(params) {
  setSetting("portalStatus", "DISABLED");

  var activeClassId = getSetting("activeClassId");
  if (activeClassId) {
    var ss = getSpreadsheet();
    var classesSheet = ss.getSheetByName(SHEET_CLASSES);
    if (classesSheet && classesSheet.getLastRow() > 1) {
      var data = classesSheet.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][0]).trim() === activeClassId) {
          classesSheet.getRange(i + 1, 8).setValue("DISABLED");
          break;
        }
      }
    }
  }

  return jsonResponse(true, "Attendance portal has been DISABLED.", {
    portalStatus: "DISABLED",
    activeClassId: activeClassId
  });
}

/**
 * ============================================================================
 * TIME-BASED ATTENDANCE STATUS (STUDENT & MONITORING PORTAL)
 * ============================================================================
 */
function getAttendanceStatus(params) {
  var serverDate = getServerDateString();
  var serverTime = getServerTimeString();
  var portalSetting = getSetting("portalStatus") || "DISABLED";
  var activeClassId = getSetting("activeClassId") || "";

  var result = {
    serverDate: serverDate,
    serverTime: serverTime,
    portalStatus: portalSetting,
    activeClassId: activeClassId,
    isAttendanceOpen: false,
    statusCode: "CLOSED",
    message: "No active class is scheduled currently.",
    classDetails: null
  };

  if (!activeClassId) {
    return jsonResponse(true, result.message, result);
  }

  var ss = getSpreadsheet();
  var classesSheet = ss.getSheetByName(SHEET_CLASSES);
  if (!classesSheet || classesSheet.getLastRow() <= 1) {
    return jsonResponse(true, result.message, result);
  }

  var data = classesSheet.getDataRange().getValues();
  var classRow = null;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === activeClassId) {
      classRow = data[i];
      break;
    }
  }

  if (!classRow) {
    result.message = "Active class details not found.";
    return jsonResponse(true, result.message, result);
  }

  var className = classRow[1];
  var classDate = normalizeDateString(classRow[2]);
  var startTime = normalizeTimeString(classRow[3]);
  var endTime = normalizeTimeString(classRow[4]);
  var openingTime = normalizeTimeString(classRow[5]);
  var closingTime = normalizeTimeString(classRow[6]);
  var adminStatus = classRow[7] || "SCHEDULED";

  result.classDetails = {
    classId: activeClassId,
    className: className,
    classDate: classDate,
    startTime: startTime,
    endTime: endTime,
    openingTime: openingTime,
    closingTime: closingTime,
    adminStatus: adminStatus
  };

  // Evaluate 5 conditions:
  // 1. Admin status is ENABLED
  // 2. A valid active class exists
  // 3. Current date matches the class date
  // 4. Current time >= opening time
  // 5. Current time < closing time

  var curMin = parseTimeToMinutes(serverTime);
  var openMin = parseTimeToMinutes(openingTime);
  var closeMin = parseTimeToMinutes(closingTime);

  if (portalSetting !== "ENABLED") {
    result.statusCode = "ADMIN_DISABLED";
    result.message = "Attendance is currently closed by the administrator.";
    result.isAttendanceOpen = false;
    return jsonResponse(true, result.message, result);
  }

  if (classDate !== serverDate) {
    result.statusCode = "DATE_MISMATCH";
    result.message = "Class is scheduled for " + classDate + ". Not open today.";
    result.isAttendanceOpen = false;
    return jsonResponse(true, result.message, result);
  }

  if (curMin < openMin) {
    result.statusCode = "NOT_STARTED";
    result.message = "Attendance has not started yet. Please wait for the scheduled time (" + openingTime + ").";
    result.isAttendanceOpen = false;
    return jsonResponse(true, result.message, result);
  }

  if (curMin >= closeMin) {
    result.statusCode = "ENDED";
    result.message = "Attendance submission time has ended.";
    result.isAttendanceOpen = false;
    return jsonResponse(true, result.message, result);
  }

  // All 5 conditions passed!
  result.isAttendanceOpen = true;
  result.statusCode = "OPEN";
  result.message = "Attendance is now open. You can mark your attendance.";

  return jsonResponse(true, result.message, result);
}

/**
 * ============================================================================
 * ATTENDANCE SUBMISSION (WITH LOCKSERVICE CONCURRENCY CONTROL)
 * ============================================================================
 */
function submitAttendance(params) {
  var rollNumber = String(params.rollNumber || "").trim().toUpperCase();
  var clientClassId = String(params.classId || "").trim();

  if (!rollNumber) {
    return jsonResponse(false, "Roll Number is required.", null);
  }

  // LockService for concurrency protection
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000); // Wait up to 20 seconds for lock
  } catch (lockErr) {
    return jsonResponse(false, "System is busy handling other submissions. Please try again in a few seconds.", null);
  }

  try {
    var ss = getSpreadsheet();
    var studentsSheet = ss.getSheetByName(SHEET_STUDENTS);
    var classesSheet = ss.getSheetByName(SHEET_CLASSES);
    var attendanceSheet = ss.getSheetByName(SHEET_ATTENDANCE);

    // 1. Check Active Class & Central Settings
    var portalStatus = getSetting("portalStatus");
    var activeClassId = getSetting("activeClassId");

    if (portalStatus !== "ENABLED" || !activeClassId) {
      return jsonResponse(false, "Attendance is currently closed by the administrator.", null);
    }

    if (clientClassId && clientClassId !== activeClassId) {
      return jsonResponse(false, "Class session mismatch. Please refresh the page.", null);
    }

    // 2. Fetch Class Details
    var classData = classesSheet.getDataRange().getValues();
    var targetClass = null;
    for (var c = 1; c < classData.length; c++) {
      if (String(classData[c][0]).trim() === activeClassId) {
        targetClass = {
          classId: classData[c][0],
          className: classData[c][1],
          classDate: normalizeDateString(classData[c][2]),
          startTime: classData[c][3],
          endTime: classData[c][4],
          openingTime: classData[c][5],
          closingTime: classData[c][6]
        };
        break;
      }
    }

    if (!targetClass) {
      return jsonResponse(false, "Active class not found.", null);
    }

    // 3. Strict Server-Side Time & Date Validation
    var serverDate = getServerDateString();
    var serverTime = getServerTimeString();
    var serverTimestamp = getServerTimestamp();

    if (targetClass.classDate !== serverDate) {
      return jsonResponse(false, "Class date does not match current server date.", null);
    }

    var curMin = parseTimeToMinutes(serverTime);
    var openMin = parseTimeToMinutes(targetClass.openingTime);
    var closeMin = parseTimeToMinutes(targetClass.closingTime);

    if (curMin < openMin) {
      return jsonResponse(false, "Attendance has not started yet. Opening time is " + targetClass.openingTime, null);
    }

    if (curMin >= closeMin) {
      return jsonResponse(false, "Attendance submission time has ended.", null);
    }

    // 4. Validate Student Exists & Active
    var studentData = studentsSheet.getDataRange().getValues();
    var studentName = null;
    var isStudentActive = false;

    for (var s = 1; s < studentData.length; s++) {
      if (String(studentData[s][0]).trim().toUpperCase() === rollNumber) {
        studentName = String(studentData[s][1]).trim();
        var status = String(studentData[s][3] || "ACTIVE").trim().toUpperCase();
        if (status === "ACTIVE" || status === "") {
          isStudentActive = true;
        }
        break;
      }
    }

    if (!studentName) {
      return jsonResponse(false, "Invalid roll number. Please check your roll number.", null);
    }

    if (!isStudentActive) {
      return jsonResponse(false, "Student account is inactive. Please contact the administrator.", null);
    }

    // 5. Duplicate Prevention: Check if already submitted for this class
    var attData = attendanceSheet.getDataRange().getValues();
    for (var a = 1; a < attData.length; a++) {
      var existingClassId = String(attData[a][1]).trim();
      var existingRoll = String(attData[a][2]).trim().toUpperCase();

      if (existingClassId === activeClassId && existingRoll === rollNumber) {
        return jsonResponse(false, "You have already marked your attendance for this class.", {
          alreadySubmitted: true,
          submissionTime: attData[a][5],
          attendanceId: attData[a][0]
        });
      }
    }

    // 6. Save Attendance
    var attendanceId = "ATT-" + serverDate.replace(/-/g, "") + "-" + Math.floor(1000 + Math.random() * 9000);
    var newRecord = [
      attendanceId,
      activeClassId,
      rollNumber,
      studentName,
      serverDate,
      serverTimestamp,
      "PRESENT"
    ];

    attendanceSheet.appendRow(newRecord);

    return jsonResponse(true, "Your attendance has been submitted successfully!", {
      attendanceId: attendanceId,
      classId: activeClassId,
      className: targetClass.className,
      rollNumber: rollNumber,
      studentName: studentName,
      date: serverDate,
      submissionTime: serverTimestamp,
      status: "PRESENT"
    });

  } catch (err) {
    return jsonResponse(false, "Attendance submission failed: " + err.toString(), null);
  } finally {
    lock.releaseLock();
  }
}

/**
 * ============================================================================
 * ADMIN ATTENDANCE RECORDS & REPORTS
 * ============================================================================
 */

/**
 * Get all attendance records with search and filters
 */
function getAttendanceRecords(params) {
  var ss = getSpreadsheet();
  var attendanceSheet = ss.getSheetByName(SHEET_ATTENDANCE);
  var classesSheet = ss.getSheetByName(SHEET_CLASSES);

  if (!attendanceSheet || attendanceSheet.getLastRow() <= 1) {
    return jsonResponse(true, "No attendance records found.", []);
  }

  // Build map of classId -> className
  var classMap = {};
  if (classesSheet && classesSheet.getLastRow() > 1) {
    var cData = classesSheet.getDataRange().getValues();
    for (var c = 1; c < cData.length; c++) {
      classMap[String(cData[c][0]).trim()] = cData[c][1];
    }
  }

  var attData = attendanceSheet.getDataRange().getValues();
  var records = [];

  var filterClassId = String(params.classId || "").trim();
  var filterDate = normalizeDateString(params.date || "");
  var filterRoll = String(params.rollNumber || "").trim().toUpperCase();
  var searchQuery = String(params.search || "").trim().toLowerCase();

  for (var i = 1; i < attData.length; i++) {
    var attId = attData[i][0];
    var cId = String(attData[i][1]).trim();
    var roll = String(attData[i][2]).trim();
    var name = String(attData[i][3]).trim();
    var recDate = normalizeDateString(attData[i][4]);
    var subTime = attData[i][5];
    var status = attData[i][6] || "PRESENT";

    if (filterClassId && cId !== filterClassId) continue;
    if (filterDate && recDate !== filterDate) continue;
    if (filterRoll && roll.toUpperCase() !== filterRoll) continue;

    if (searchQuery) {
      var matchSearch = roll.toLowerCase().indexOf(searchQuery) > -1 ||
                         name.toLowerCase().indexOf(searchQuery) > -1 ||
                         cId.toLowerCase().indexOf(searchQuery) > -1;
      if (!matchSearch) continue;
    }

    records.push({
      attendanceId: attId,
      classId: cId,
      className: classMap[cId] || cId,
      rollNumber: roll,
      studentName: name,
      date: recDate,
      submissionTime: subTime instanceof Date ? Utilities.formatDate(subTime, TIMEZONE, "yyyy-MM-dd HH:mm:ss") : String(subTime),
      status: status
    });
  }

  // Sort descending by time
  records.reverse();

  return jsonResponse(true, "Attendance records fetched.", records);
}

/**
 * Class-wise Attendance Report with Absent students calculated on-the-fly
 * Compares active student list with attendance submissions for selected class
 */
function getClassAttendanceReport(params) {
  var classId = String(params.classId || "").trim();
  if (!classId) {
    return jsonResponse(false, "Class ID is required.", null);
  }

  var ss = getSpreadsheet();
  var studentsSheet = ss.getSheetByName(SHEET_STUDENTS);
  var classesSheet = ss.getSheetByName(SHEET_CLASSES);
  var attendanceSheet = ss.getSheetByName(SHEET_ATTENDANCE);

  if (!classesSheet || classesSheet.getLastRow() <= 1) {
    return jsonResponse(false, "No classes found.", null);
  }

  // Get Class Info
  var classData = classesSheet.getDataRange().getValues();
  var classInfo = null;
  for (var c = 1; c < classData.length; c++) {
    if (String(classData[c][0]).trim() === classId) {
      classInfo = {
        classId: classData[c][0],
        className: classData[c][1],
        classDate: normalizeDateString(classData[c][2]),
        startTime: classData[c][3],
        endTime: classData[c][4]
      };
      break;
    }
  }

  if (!classInfo) {
    return jsonResponse(false, "Class not found.", null);
  }

  // Get Registered Active Students
  var studentList = [];
  if (studentsSheet && studentsSheet.getLastRow() > 1) {
    var sData = studentsSheet.getDataRange().getValues();
    for (var s = 1; s < sData.length; s++) {
      var roll = String(sData[s][0]).trim();
      var sName = String(sData[s][1]).trim();
      var stStatus = String(sData[s][3] || "ACTIVE").trim().toUpperCase();
      if (roll && (stStatus === "ACTIVE" || stStatus === "")) {
        studentList.push({
          rollNumber: roll,
          studentName: sName
        });
      }
    }
  }

  // Get Submissions for this Class
  var submissions = {};
  if (attendanceSheet && attendanceSheet.getLastRow() > 1) {
    var aData = attendanceSheet.getDataRange().getValues();
    for (var a = 1; a < aData.length; a++) {
      if (String(aData[a][1]).trim() === classId) {
        var subRoll = String(aData[a][2]).trim().toUpperCase();
        submissions[subRoll] = {
          attendanceId: aData[a][0],
          submissionTime: aData[a][5] instanceof Date ? Utilities.formatDate(aData[a][5], TIMEZONE, "yyyy-MM-dd HH:mm:ss") : String(aData[a][5]),
          status: aData[a][6] || "PRESENT"
        };
      }
    }
  }

  // Combine report
  var report = [];
  var presentCount = 0;
  var absentCount = 0;

  for (var i = 0; i < studentList.length; i++) {
    var st = studentList[i];
    var upper = st.rollNumber.toUpperCase();
    var sub = submissions[upper];

    if (sub) {
      presentCount++;
      report.push({
        rollNumber: st.rollNumber,
        studentName: st.studentName,
        classId: classInfo.classId,
        className: classInfo.className,
        date: classInfo.classDate,
        time: sub.submissionTime,
        status: "PRESENT",
        attendanceId: sub.attendanceId
      });
    } else {
      absentCount++;
      report.push({
        rollNumber: st.rollNumber,
        studentName: st.studentName,
        classId: classInfo.classId,
        className: classInfo.className,
        date: classInfo.classDate,
        time: "-",
        status: "ABSENT",
        attendanceId: "-"
      });
    }
  }

  var total = studentList.length;
  var percentage = total > 0 ? Math.round((presentCount / total) * 100) : 0;

  return jsonResponse(true, "Class report generated successfully.", {
    classInfo: classInfo,
    totalStudents: total,
    presentCount: presentCount,
    absentCount: absentCount,
    attendancePercentage: percentage,
    report: report
  });
}

/**
 * Export data preparation endpoint
 */
function exportAttendanceData(params) {
  var exportType = params.type || "classReport"; // "classReport", "allHistory", "students"
  if (exportType === "classReport") {
    return getClassAttendanceReport(params);
  } else if (exportType === "students") {
    return getStudentsList(params);
  } else {
    return getAttendanceRecords(params);
  }
}

