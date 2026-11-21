/**
 * ============================================================================
 * CENTRALIZED STUDENT ATTENDANCE MANAGEMENT SYSTEM - EXCEL / SHEETJS ENGINE
 * ============================================================================
 * Handles .xlsx / .xls file reading, validation, previewing, and exporting
 * using SheetJS (xlsx.full.min.js).
 */

const ExcelEngine = {
  parsedStudentsData: [],

  /**
   * Read and parse uploaded student Excel file (.xlsx or .xls)
   * @param {File} file - Excel file object
   * @returns {Promise<object>} - Preview report
   */
  async parseStudentFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: "array" });

          // Read the first worksheet
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];

          if (!worksheet) {
            throw new Error("The uploaded Excel workbook contains no sheets.");
          }

          // Convert to JSON array of objects
          const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

          if (!rawRows || rawRows.length === 0) {
            throw new Error("The Excel sheet is empty. Please add student records.");
          }

          // Normalize and validate columns
          const result = this.validateAndNormalizeStudents(rawRows);
          this.parsedStudentsData = result.validRecords;
          resolve(result);

        } catch (err) {
          reject(err);
        }
      };

      reader.onerror = (err) => reject(new Error("Failed to read the file."));
      reader.readAsArrayBuffer(file);
    });
  },

  /**
   * Normalize headers and validate records
   */
  validateAndNormalizeStudents(rows) {
    const validRecords = [];
    const invalidRecords = [];
    const seenRolls = new Set();

    rows.forEach((row, index) => {
      // Find Roll Number column flexibly (supports "Roll Number", "Roll No", "Roll", "roll_number")
      let roll = "";
      let name = "";
      let email = "";
      let status = "ACTIVE";

      for (const key of Object.keys(row)) {
        const cleanKey = key.trim().toLowerCase();
        if (cleanKey.includes("roll")) {
          roll = String(row[key]).trim();
        } else if (cleanKey.includes("name") || cleanKey.includes("student")) {
          name = String(row[key]).trim();
        } else if (cleanKey.includes("mail")) {
          email = String(row[key]).trim();
        } else if (cleanKey.includes("status")) {
          status = String(row[key]).trim().toUpperCase() || "ACTIVE";
        }
      }

      const rowNumber = index + 2; // Accounting for 1-based index and header row

      // Validation Checks
      if (!roll) {
        invalidRecords.push({ rowNumber, reason: "Missing Roll Number", data: row });
        return;
      }

      if (!name) {
        invalidRecords.push({ rowNumber, rollNumber: roll, reason: "Missing Student Name", data: row });
        return;
      }

      const upperRoll = roll.toUpperCase();
      if (seenRolls.has(upperRoll)) {
        invalidRecords.push({ rowNumber, rollNumber: roll, reason: "Duplicate Roll Number in file", data: row });
        return;
      }

      seenRolls.add(upperRoll);

      validRecords.push({
        rollNumber: roll,
        studentName: name,
        email: email,
        status: status || "ACTIVE"
      });
    });

    return {
      totalRows: rows.length,
      validRecords: validRecords,
      invalidRecords: invalidRecords
    };
  },

  /**
   * Export Present and Absent Student Report for a Class to Excel
   */
  exportClassAttendanceReport(reportData, classInfo) {
    if (!reportData || reportData.length === 0) {
      showToast("No report data available to export.", "warning");
      return;
    }

    // Format rows according to expected Excel columns:
    // Roll Number | Student Name | Class Name | Date | Time | Status
    const exportRows = reportData.map((item) => ({
      "Roll Number": item.rollNumber,
      "Student Name": item.studentName,
      "Class Name": item.className || (classInfo ? classInfo.className : ""),
      "Date": item.date || (classInfo ? classInfo.classDate : ""),
      "Time": item.time || "-",
      "Status": item.status // PRESENT or ABSENT
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);

    // Apply column widths
    worksheet["!cols"] = [
      { wch: 16 }, // Roll Number
      { wch: 28 }, // Student Name
      { wch: 26 }, // Class Name
      { wch: 14 }, // Date
      { wch: 22 }, // Time
      { wch: 14 }  // Status
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Attendance Report");

    const safeClassName = (classInfo?.className || "Class").replace(/[^a-zA-Z0-9_-]/g, "_");
    const safeDate = (classInfo?.classDate || "").replace(/-/g, "");
    const fileName = `Attendance_${safeClassName}_${safeDate || "Report"}.xlsx`;

    XLSX.writeFile(workbook, fileName);
    showToast(`Exported ${fileName} successfully!`, "success");
  },

  /**
   * Export All Attendance Records
   */
  exportAttendanceHistory(records) {
    if (!records || records.length === 0) {
      showToast("No attendance records found to export.", "warning");
      return;
    }

    const exportRows = records.map((r) => ({
      "Attendance ID": r.attendanceId,
      "Class ID": r.classId,
      "Class Name": r.className,
      "Roll Number": r.rollNumber,
      "Student Name": r.studentName,
      "Date": r.date,
      "Time": r.submissionTime,
      "Status": r.status
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    worksheet["!cols"] = [
      { wch: 22 }, { wch: 20 }, { wch: 24 },
      { wch: 16 }, { wch: 26 }, { wch: 14 }, { wch: 22 }, { wch: 12 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Attendance History");
    XLSX.writeFile(workbook, `Complete_Attendance_History_${new Date().toISOString().substring(0, 10)}.xlsx`);
    showToast("Attendance history exported successfully!", "success");
  },

  /**
   * Export Registered Students List
   */
  exportStudentsList(students) {
    if (!students || students.length === 0) {
      showToast("No student records to export.", "warning");
      return;
    }

    const exportRows = students.map((s) => ({
      "Roll Number": s.rollNumber,
      "Student Name": s.studentName,
      "Email": s.email || "",
      "Status": s.status || "ACTIVE"
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    worksheet["!cols"] = [{ wch: 18 }, { wch: 28 }, { wch: 30 }, { wch: 14 }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Students");
    XLSX.writeFile(workbook, `Registered_Students_${new Date().toISOString().substring(0, 10)}.xlsx`);
    showToast("Students list exported successfully!", "success");
  },

  /**
   * Download Sample Student Template for initial 37 students
   */
  downloadSampleTemplate() {
    const sampleData = [
      { "Roll Number": "STU-001", "Student Name": "Aarav Sharma", "Email": "aarav.sharma@example.com", "Status": "ACTIVE" },
      { "Roll Number": "STU-002", "Student Name": "Aanya Patel", "Email": "aanya.patel@example.com", "Status": "ACTIVE" },
      { "Roll Number": "STU-003", "Student Name": "Aditya Verma", "Email": "aditya.verma@example.com", "Status": "ACTIVE" },
      { "Roll Number": "STU-004", "Student Name": "Ananya Iyer", "Email": "ananya.iyer@example.com", "Status": "ACTIVE" },
      { "Roll Number": "STU-005", "Student Name": "Arjun Reddy", "Email": "arjun.reddy@example.com", "Status": "ACTIVE" },
      { "Roll Number": "STU-006", "Student Name": "Bhavya Nair", "Email": "bhavya.nair@example.com", "Status": "ACTIVE" },
      { "Roll Number": "STU-007", "Student Name": "Chirag Gupta", "Email": "chirag.gupta@example.com", "Status": "ACTIVE" },
      { "Roll Number": "STU-008", "Student Name": "Deepika Joshi", "Email": "deepika.joshi@example.com", "Status": "ACTIVE" },
      { "Roll Number": "STU-009", "Student Name": "Devendra Singh", "Email": "devendra.singh@example.com", "Status": "ACTIVE" },
      { "Roll Number": "STU-010", "Student Name": "Divya Rao", "Email": "divya.rao@example.com", "Status": "ACTIVE" },
      { "Roll Number": "STU-011", "Student Name": "Gautam Mehta", "Email": "gautam.mehta@example.com", "Status": "ACTIVE" },
      { "Roll Number": "STU-012", "Student Name": "Harini Krishnan", "Email": "harini.krishnan@example.com", "Status": "ACTIVE" },
      { "Roll Number": "STU-013", "Student Name": "Ishaan Roy", "Email": "ishaan.roy@example.com", "Status": "ACTIVE" },
      { "Roll Number": "STU-014", "Student Name": "Janani Sundaram", "Email": "janani.sundaram@example.com", "Status": "ACTIVE" },
      { "Roll Number": "STU-015", "Student Name": "Karan Malhotra", "Email": "karan.malhotra@example.com", "Status": "ACTIVE" },
      { "Roll Number": "STU-016", "Student Name": "Kavya Pillai", "Email": "kavya.pillai@example.com", "Status": "ACTIVE" },
      { "Roll Number": "STU-017", "Student Name": "Manish Tiwari", "Email": "manish.tiwari@example.com", "Status": "ACTIVE" },
      { "Roll Number": "STU-018", "Student Name": "Meera Nambiar", "Email": "meera.nambiar@example.com", "Status": "ACTIVE" },
      { "Roll Number": "STU-019", "Student Name": "Naveen Kumar", "Email": "naveen.kumar@example.com", "Status": "ACTIVE" },
      { "Roll Number": "STU-020", "Student Name": "Neha Deshmukh", "Email": "neha.deshmukh@example.com", "Status": "ACTIVE" },
      { "Roll Number": "STU-021", "Student Name": "Nikhil Agarwal", "Email": "nikhil.agarwal@example.com", "Status": "ACTIVE" },
      { "Roll Number": "STU-022", "Student Name": "Pooja Hegde", "Email": "pooja.hegde@example.com", "Status": "ACTIVE" },
      { "Roll Number": "STU-023", "Student Name": "Pranav Chawla", "Email": "pranav.chawla@example.com", "Status": "ACTIVE" },
      { "Roll Number": "STU-024", "Student Name": "Priya Sen", "Email": "priya.sen@example.com", "Status": "ACTIVE" },
      { "Roll Number": "STU-025", "Student Name": "Rahul Bhatt", "Email": "rahul.bhatt@example.com", "Status": "ACTIVE" },
      { "Roll Number": "STU-026", "Student Name": "Rhea Menon", "Email": "rhea.menon@example.com", "Status": "ACTIVE" },
      { "Roll Number": "STU-027", "Student Name": "Rohan Das", "Email": "rohan.das@example.com", "Status": "ACTIVE" },
      { "Roll Number": "STU-028", "Student Name": "Saanvi Kulkarni", "Email": "saanvi.kulkarni@example.com", "Status": "ACTIVE" },
      { "Roll Number": "STU-029", "Student Name": "Sameer Khan", "Email": "sameer.khan@example.com", "Status": "ACTIVE" },
      { "Roll Number": "STU-030", "Student Name": "Shreya Ghosh", "Email": "shreya.ghosh@example.com", "Status": "ACTIVE" },
      { "Roll Number": "STU-031", "Student Name": "Siddharth Jain", "Email": "siddharth.jain@example.com", "Status": "ACTIVE" },
      { "Roll Number": "STU-032", "Student Name": "Sneha Mukherjee", "Email": "sneha.mukherjee@example.com", "Status": "ACTIVE" },
      { "Roll Number": "STU-033", "Student Name": "Tarun Bansal", "Email": "tarun.bansal@example.com", "Status": "ACTIVE" },
      { "Roll Number": "STU-034", "Student Name": "Trisha Bose", "Email": "trisha.bose@example.com", "Status": "ACTIVE" },
      { "Roll Number": "STU-035", "Student Name": "Varun Kapoor", "Email": "varun.kapoor@example.com", "Status": "ACTIVE" },
      { "Roll Number": "STU-036", "Student Name": "Vidya Balan", "Email": "vidya.balan@example.com", "Status": "ACTIVE" },
      { "Roll Number": "STU-037", "Student Name": "Yash Vardhan", "Email": "yash.vardhan@example.com", "Status": "ACTIVE" }
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    worksheet["!cols"] = [{ wch: 16 }, { wch: 24 }, { wch: 30 }, { wch: 12 }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "37_Students_Template");
    XLSX.writeFile(workbook, "Sample_37_Students_List.xlsx");
    showToast("Downloaded sample 37 students Excel template!", "success");
  }
};

