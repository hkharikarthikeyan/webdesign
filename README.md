# Centralized Student Attendance Management System

A complete, production-ready, responsive Student Attendance Management System designed for an online learning community with 37 registered students. The application synchronizes all records centrally in real time using **Google Sheets** as the single source of truth, integrated via a lightweight **Google Apps Script Web App** server layer and processed using **HTML5, CSS3, Vanilla JavaScript, and SheetJS (xlsx)**.

---

## 1. System Architecture

```text
Admin Browser  ─────────┐
                        ├── HTML5 / CSS3 / Vanilla JavaScript Frontend
Student Mobile/Browser ─┘    (Hosted on GitHub Pages, Netlify, etc.)
                                       │
                                       │ HTTPS JSON API
                                       ▼
                             Google Apps Script
                             (Authoritative Timezone: Asia/Kolkata,
                              LockService Concurrency, Token Auth)
                                       │
                                       │ Spreadsheet Service
                                       ▼
                             Google Spreadsheet
                             ├── Sheet 1: Students
                             ├── Sheet 2: Classes
                             ├── Sheet 3: Attendance
                             └── Sheet 4: Settings
```

- **Single Source of Truth:** Central Google Spreadsheet.
- **Zero LocalStorage Primary Storage:** LocalStorage is only used for client UI preferences and the expiring admin session token. Attendance records are never stored locally.
- **Zero Untrusted Clocks:** Attendance window eligibility is calculated strictly on the Google Apps Script server in timezone `Asia/Kolkata` (IST). Mobile device clocks cannot bypass restrictions.
- **Concurrency Protection:** Google Apps Script `LockService` serializes simultaneous submissions and prevents race conditions or duplicate entries.

---

## 2. Directory Structure

```text
student-attendance/
│
├── index.html                 # Portal selection hub (Student & Admin)
├── student.html               # Mobile-friendly Student Attendance Portal
├── admin-login.html           # Admin Authentication Page
├── admin-dashboard.html       # Full Admin Management Dashboard
│
├── css/
│   └── style.css              # Responsive styling, color tokens, and components
│
├── js/
│   ├── config.js              # System settings, API URL, polling intervals
│   ├── api.js                 # Network client with CORS-safe POST communication
│   ├── student.js             # Student portal polling, verification & submission
│   ├── admin.js               # Admin dashboard, controls, KPI stats, schedule
│   ├── attendance.js          # Attendance logs, filtering, calculated absentees
│   └── excel.js               # SheetJS import preview & export engines
│
├── apps-script/
│   └── Code.gs                # Complete Google Apps Script Web App backend
│
├── sample-students.xlsx       # Ready-to-import Excel file with 37 student records
└── README.md                  # Complete documentation and deployment guide
```

---

## 3. Google Sheets Database Schema

Create one Google Spreadsheet with the following four worksheets:

### Sheet 1: `Students`
| Column A | Column B | Column C | Column D |
|---|---|---|---|
| **Roll Number** | **Student Name** | **Email** | **Status** |
| STU-001 | Aarav Sharma | aarav.sharma@example.com | ACTIVE |
| STU-002 | Aanya Patel | aanya.patel@example.com | ACTIVE |

### Sheet 2: `Classes`
| Column A | Column B | Column C | Column D | Column E | Column F | Column G | Column H |
|---|---|---|---|---|---|---|---|
| **Class ID** | **Class Name** | **Class Date** | **Start Time** | **End Time** | **Opening Time** | **Closing Time** | **Admin Status** |
| CLS-20261115-101 | HTML & CSS | 2026-11-15 | 19:00 | 20:00 | 19:00 | 19:15 | ENABLED |

### Sheet 3: `Attendance`
| Column A | Column B | Column C | Column D | Column E | Column F | Column G |
|---|---|---|---|---|---|---|
| **Attendance ID** | **Class ID** | **Roll Number** | **Student Name** | **Date** | **Submission Time** | **Status** |
| ATT-20261115-1042 | CLS-20261115-101 | STU-001 | Aarav Sharma | 2026-11-15 | 2026-11-15 19:04:12 | PRESENT |

### Sheet 4: `Settings`
| Column A | Column B | Column C | Column D |
|---|---|---|---|
| **Setting Key** | **Setting Value** | **Description** | **Last Updated** |
| `portalStatus` | `DISABLED` | Overall Attendance Portal Status (ENABLED/DISABLED) | 2026-11-13 19:40:00 |
| `activeClassId` | `CLS-20261115-101` | Current Active Class ID for Attendance | 2026-11-13 19:40:00 |
| `systemName` | `EduAttend Centralized Attendance` | Application Name | 2026-11-13 19:40:00 |

*(Note: The system contains an auto-initialization function `initializeDatabase` that will automatically create and format these 4 sheets with headers if they do not exist).*

---

## 4. Google Apps Script Deployment Guide

### Step 1: Create Spreadsheet
1. Go to [Google Sheets](https://sheets.new) and create a new blank spreadsheet.
2. Name it: **"Centralized Student Attendance Database"**.

### Step 2: Open Apps Script Editor
1. In the Google Sheets menu, click **Extensions &gt; Apps Script**.
2. Rename the project to **"Attendance-API"**.

### Step 3: Paste Backend Code
1. Replace the default content of `Code.gs` with the entire contents of [Code.gs](file:///d:/Arzin/Attendence/apps-script/Code.gs).

### Step 4: Configure Project Timezone & Script Properties
1. In the Apps Script left sidebar, click the **Gear icon (Project Settings)**.
2. Check the box **"Show 'appsscript.json' manifest file in editor"**.
3. Under **Script Properties**, click **Edit script properties &gt; Add script property**:
   - Property: `ADMIN_USERNAME` | Value: `admin`
   - Property: `ADMIN_PASSWORD` | Value: `Admin@1234` (or your chosen secure password)
4. Go back to the **Editor**, click `appsscript.json`, and ensure the timeZone is:
   ```json
   {
     "timeZone": "Asia/Kolkata",
     "dependencies": {},
     "exceptionLogging": "STACKDRIVER",
     "runtimeVersion": "V8"
   }
   ```

### Step 5: Initialize Database Sheets
1. In the Apps Script toolbar, select the function dropdown `setupDatabase`.
2. Click **Run**.
3. Review and grant permissions when prompted.
4. Check your Google Spreadsheet: the 4 worksheets (`Students`, `Classes`, `Attendance`, `Settings`) will be created and formatted automatically.

### Step 6: Deploy as Web App
1. At the top right of Apps Script, click **Deploy &gt; New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Enter:
   - **Description:** `Production Release v1`
   - **Execute as:** `Me (your email address)`
   - **Who has access:** `Anyone` *(Crucial: This enables cross-device access from student and admin phones/laptops without requiring students to log into Google accounts).*
4. Click **Deploy**.
5. Copy the generated **Web App URL** (ends in `/exec`).

### Updating Deployment After Code Modifications
Whenever you make modifications to `Code.gs`:
1. Click **Deploy &gt; Manage deployments**.
2. Click the **Pencil (Edit)** icon next to the active deployment.
3. In the **Version** dropdown, select **New version**.
4. Click **Deploy**.

---

## 5. Frontend Configuration & Hosting

### Option A: Direct Configuration in `config.js`
Open [js/config.js](file:///d:/Arzin/Attendence/js/config.js) and paste your Web App URL:
```javascript
const CONFIG = {
  API_BASE_URL: "https://script.google.com/macros/s/AKfycb.../exec",
  TIMEZONE: "Asia/Kolkata",
  POLL_INTERVAL_MS: 6000,
  ...
};
```

### Option B: Quick Setup via Admin UI
You can also set or change the Web App API URL directly from the browser:
1. Open `admin-login.html` and click **"Configure Web App API URL"** or go to **Settings** in the Admin Dashboard.
2. Paste the URL. It is saved in your browser and used for all calls.

### Hosting the Frontend
Because the frontend uses pure HTML5, CSS3, and Vanilla JavaScript, it can be hosted on any static platform:
- **GitHub Pages:**
  1. Push this folder to a GitHub repository.
  2. Go to **Settings &gt; Pages &gt; Branch: main &gt; Save**.
- **Netlify:**
  - Drag and drop this folder directly into [Netlify Drop](https://app.netlify.com/drop).
- **Local Testing:**
  - Run any local static server:
    ```bash
    python -m http.server 8000
    ```
  - Open `http://localhost:8000/index.html` in your browser.

---

## 6. Features & Workflows

### 1. 37-Student Master Import (SheetJS)
- Click **Student Management** &gt; **Upload Student Excel**.
- Drag & drop [sample-students.xlsx](file:///d:/Arzin/Attendence/sample-students.xlsx) (included in this repository) or any `.xlsx`/`.xls` file.
- The system previews records, validates empty names/rolls, detects duplicates, and writes them centrally to the `Students` sheet.
- Existing historical attendance records are preserved.

### 2. Class Scheduling with Strict Validations
- Admin creates a class with:
  - Class Name
  - Class Date
  - Start Time & End Time
  - Attendance Opening Time & Closing Time
- Validations enforced:
  - Start Time < End Time
  - Attendance Opening Time >= Class Start Time
  - Attendance Closing Time > Attendance Opening Time
  - Attendance Closing Time <= Class End Time

### 3. Real-Time Admin Attendance Controls
- **ENABLE ATTENDANCE:** Opens attendance for the selected class. Verifies date matches server date and current server time falls inside the window. Green badge displayed.
- **DISABLE ATTENDANCE:** Immediately switches `portalStatus` to `DISABLED` centrally. Rejects any pending student attempts immediately. Red badge displayed.

### 4. Automatic 5-Condition Attendance Logic
Attendance is accepted only if:
1. Admin status is `ENABLED`.
2. A valid active class exists.
3. Current server date matches the class date.
4. Current server time >= opening time.
5. Current server time < closing time.

### 5. Two-Step Student Attendance Verification
1. Student enters Roll Number (e.g. `STU-001`) and clicks **Verify Roll Number**.
2. Server verifies student exists and is `ACTIVE` without exposing the whole roster.
3. UI displays: `"Welcome, Aarav Sharma. Please confirm your attendance."`
4. The **MARK ATTENDANCE** button activates only when the window is open.
5. On submission, the server verifies conditions under `LockService` concurrency locks, stores the record with a unique `Attendance ID`, and prevents duplicate submissions.

### 6. Excel Attendance Reports & Absentees
- Download **Class Attendance Report** as `.xlsx`.
- Automatically calculates **ABSENT** status by comparing the 37 active students against attendance records for that session.
- Columns exported: `Roll Number` | `Student Name` | `Class Name` | `Date` | `Time` | `Status`.

---

## 7. Complete Verification Checklist (20 Scenarios)

| # | Test Scenario | Expected Result |
|---|---|---|
| 1 | Admin login with correct credentials (`admin` / `Admin@1234`) | Generates secure token, redirects to dashboard |
| 2 | Admin login with incorrect credentials | Rejects with "Invalid username or password" |
| 3 | Upload `sample-students.xlsx` (37 students) | SheetJS previews rows; saves 37 records to `Students` sheet |
| 4 | Verify valid roll number (e.g. `STU-001`) on student portal | Returns "Welcome, Aarav Sharma. Please confirm your attendance." |
| 5 | Verify non-existent roll number | Returns "Invalid roll number. Please check your roll number." |
| 6 | Admin creates a class schedule | Class ID generated (e.g. `CLS-20261115-xxx`); saved to `Classes` sheet |
| 7 | Admin enables attendance | `portalStatus` set to `ENABLED`; green indicator shown |
| 8 | Students on different browsers/devices load page | Status updates to "Attendance is now open" within 6 seconds |
| 9 | Students submit attendance from different devices | All records appear in the central `Attendance` sheet |
| 10 | Verify submissions in Google Sheets | Rows populated with unique `ATT-...` ID, Class ID, Roll, Name, Server Timestamp, PRESENT |
| 11 | Simultaneous submissions by multiple students | `LockService` serializes requests without collision or data loss |
| 12 | Student submits attendance twice | Rejects second attempt: "You have already marked your attendance for this class." |
| 13 | Admin clicks "DISABLE ATTENDANCE" | Portal status set to `DISABLED` centrally |
| 14 | Student attempts submission after portal disabled | Server rejects submission with "Attendance is currently closed by the administrator." |
| 15 | Submission attempted after closing time | Server rejects with "Attendance submission time has ended." |
| 16 | Student modifies their local phone/PC clock | Server validates authoritative `Asia/Kolkata` time and blocks submission |
| 17 | Check present and absent counts in dashboard | KPI cards show exact counts and calculated attendance percentage |
| 18 | Admin exports Excel report via SheetJS | Generates `.xlsx` report with all 37 students (Present with time, Absent with '-') |
| 19 | Create a new class for a future date | Historical attendance records remain intact and viewable |
| 20 | Unauthorized API request without session token | Apps Script rejects with `Unauthorized: Session token missing` |

