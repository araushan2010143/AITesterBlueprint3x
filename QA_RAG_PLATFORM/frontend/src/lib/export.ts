import * as XLSX from "xlsx";
import {
  Document, Paragraph, Table, TableRow, TableCell, TextRun,
  HeadingLevel, WidthType, BorderStyle, Packer,
} from "docx";

// ── Helpers ───────────────────────────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 5000);
}

function cellStr(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (Array.isArray(val)) return val.join("; ");
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

/** Extract the primary array from any action result */
function extractRows(actionId: string, result: any): { headers: string[]; rows: string[][] } {
  let arr: any[] | null = null;

  // test_data / generate_test_cases: enterprise format (with steps) or flat format
  if (actionId === "test_data" || actionId === "generate_test_cases") {
    const tc: any[] = result.test_cases ?? [];
    if (tc.length > 0) {
      // Check if new enterprise format (has steps array) or old flat format
      const hasSteps = tc.some((t: any) => Array.isArray(t.steps));
      if (hasSteps) {
        // Flatten: one row per step, TC metadata repeated
        const headers = [
          "TC ID", "Summary", "Module", "Feature", "Priority", "Severity",
          "Type", "Automation", "Category", "Technique", "Validity",
          "Preconditions", "Test Data",
          "Step No", "Action", "Expected Result",
          "Post Conditions", "Tags", "API", "Status Code", "Traceability",
        ];
        const rows: string[][] = [];
        for (const t of tc) {
          const pre = _precondStr(t.preconditions);
          const td = _testDataStr(t.test_data);
          const tags = (t.automation_tags ?? []).join(", ");
          const steps: any[] = Array.isArray(t.steps) && t.steps.length > 0
            ? t.steps
            : [{ step_no: 1, action: t.summary ?? "", expected_result: t.expected_result ?? "" }];
          steps.forEach((s: any, i: number) => {
            rows.push([
              t.id ?? "", t.summary ?? "", t.module ?? "", t.feature ?? "",
              t.priority ?? "", t.severity ?? "", t.type ?? "Functional",
              t.automation ?? "Yes", t.category ?? "", t.technique ?? "", t.validity ?? "",
              i === 0 ? pre : "",
              i === 0 ? td : "",
              String(s.step_no ?? i + 1), s.action ?? "", s.expected_result ?? "",
              i === 0 ? (t.post_conditions ?? "") : "",
              i === 0 ? tags : "",
              i === 0 ? (t.expected_api ?? "") : "",
              i === 0 ? (t.expected_status_code ?? "") : "",
              i === 0 ? (t.traceability ?? "") : "",
            ]);
          });
        }
        return { headers, rows };
      }
      // Old flat format
      const headers = Object.keys(tc[0]);
      const rows = tc.map((item: any) => headers.map(h => cellStr(item[h])));
      return { headers, rows };
    }
    // Legacy nested test_data object
    const td = result.test_data;
    if (!td || typeof td !== "object") return { headers: ["Category", "Value"], rows: [] };
    const rows: string[][] = [];
    for (const [category, items] of Object.entries(td)) {
      if (!Array.isArray(items)) continue;
      for (const item of items as any[]) {
        rows.push([category.replace(/_/g, " "), typeof item === "object" && item !== null ? JSON.stringify(item) : String(item)]);
      }
    }
    return { headers: ["Category", "Value"], rows };
  }

  if (actionId === "generate_test_cases") arr = result.test_cases;
  else if (actionId === "find_duplicates")  arr = result.duplicate_groups ?? result.duplicates ?? result.groups;
  else if (actionId === "coverage_analysis") arr = result.coverage ?? result.requirements ?? result.gaps;
  else if (actionId === "rca")              arr = result.root_causes;
  else if (actionId === "automate")         arr = result.recommendations;
  else if (actionId === "flaky_analyzer") {
    const ft: any[] = result.flaky_tests ?? [];
    if (ft.length > 0) {
      const headers = [
        "Test ID", "Test Name", "Pass Rate", "Flaky Score", "Run History",
        "Flakiness Category", "Root Cause", "Fix Recommendation", "Code Fix",
        "Priority", "Action", "Est. Fix Time",
      ];
      const rows = ft.map((t: any) => [
        cellStr(t.test_id), cellStr(t.test_name), cellStr(t.pass_rate),
        cellStr(t.flaky_score), cellStr(t.run_history),
        cellStr(t.flakiness_category), cellStr(t.root_cause),
        cellStr(t.fix_recommendation), cellStr(t.code_fix),
        cellStr(t.priority), cellStr(t.action), cellStr(t.estimated_fix_time),
      ]);
      return { headers, rows };
    }
    return { headers: ["Field", "Value"], rows: [] };
  }

  // Array found and non-empty — use it as the main table
  if (Array.isArray(arr) && arr.length > 0) {
    const headers = Object.keys(arr[0]);
    const rows = arr.map(item => headers.map(h => cellStr(item[h])));
    return { headers, rows };
  }

  // Array was empty or not found — expand summary if present, else flat fallback
  if (result.summary && typeof result.summary === "object") {
    const summaryRows = Object.entries(result.summary).map(([k, v]) => [
      k.replace(/_/g, " "),
      cellStr(v),
    ]);
    const noDataRow = arr !== null && arr?.length === 0
      ? [["— No items found —", ""]]
      : [];
    return {
      headers: ["Metric", "Value"],
      rows: [...noDataRow, ...summaryRows],
    };
  }

  // Final fallback: flat key/value
  const entries = Object.entries(result).filter(([k]) => k !== "tokens_used" && k !== "latency_ms");
  return {
    headers: ["Field", "Value"],
    rows: entries.map(([k, v]) => [k.replace(/_/g, " "), cellStr(v)]),
  };
}

// ── CSV ───────────────────────────────────────────────────────────────────────

export function downloadCSV(actionId: string, result: any, filename?: string) {
  const { headers, rows } = extractRows(actionId, result);
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [headers.map(escape).join(","), ...rows.map(r => r.map(escape).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, filename ?? `${actionId}.csv`);
}

// ── XLSX ──────────────────────────────────────────────────────────────────────

export function downloadXLSX(actionId: string, result: any, filename?: string) {
  const wb = XLSX.utils.book_new();

  if (actionId === "test_data" || actionId === "generate_test_cases") {
    const tc = result.test_cases as any[] | undefined;
    if (Array.isArray(tc) && tc.length > 0) {
      const hasSteps = tc.some((t: any) => Array.isArray(t.steps));

      if (hasSteps) {
        // ── Enterprise format ──────────────────────────────────────────────────

        // Sheet 1: Test Cases overview (one row per TC)
        const ovCols = ["id","summary","module","feature","priority","severity","type",
                        "automation","category","technique","validity","requirement_id","traceability","owner"];
        const ovHeaders = ["TC ID","Summary","Module","Feature","Priority","Severity","Type",
                           "Automation","Category","Technique","Validity","Requirement","Traceability","Owner"];
        const ovData = (tc as any[]).map(t => ovCols.map(k => cellStr(t[k])));
        const ws1 = XLSX.utils.aoa_to_sheet([ovHeaders, ...ovData]);
        _styleHeaderRow(ws1, ovHeaders.length);
        ws1["!cols"] = ovHeaders.map(h => ({ wch: Math.max(h.length + 2, 16) }));
        XLSX.utils.book_append_sheet(wb, ws1, "Test Cases");

        // Sheet 2: Test Steps (one row per step)
        const { headers: stH, rows: stR } = extractRows(actionId, result);
        const ws2 = XLSX.utils.aoa_to_sheet([stH, ...stR]);
        _styleHeaderRow(ws2, stH.length);
        ws2["!cols"] = stH.map(h => ({ wch: Math.max(h.length + 2, 18) }));
        XLSX.utils.book_append_sheet(wb, ws2, "Test Steps");

      } else {
        // ── Old flat format ────────────────────────────────────────────────────
        const ws = XLSX.utils.json_to_sheet(tc);
        _styleHeaderRow(ws, Object.keys(tc[0]).length);
        const colKeys = Object.keys(tc[0]);
        ws["!cols"] = colKeys.map((k) => ({
          wch: Math.max(k.length + 2, ...(tc as any[]).map(r => cellStr(r[k]).length).slice(0, 100)) + 2,
        }));
        XLSX.utils.book_append_sheet(wb, ws, "Test Cases");
      }

      // By Category pivot (both formats)
      const byCategory: Record<string, number> = {};
      const byTechnique: Record<string, number> = {};
      const byValidity: Record<string, number> = { valid: 0, invalid: 0 };
      for (const c of tc as any[]) {
        byCategory[c.category] = (byCategory[c.category] ?? 0) + 1;
        byTechnique[c.technique] = (byTechnique[c.technique] ?? 0) + 1;
        if (c.validity === "valid") byValidity.valid++; else byValidity.invalid++;
      }
      const pivotRows = [
        ["Category", "Count"],
        ...Object.entries(byCategory).map(([k, v]) => [k, v]),
        ["", ""],
        ["Technique", "Count"],
        ...Object.entries(byTechnique).map(([k, v]) => [k, v]),
        ["", ""],
        ["Validity", "Count"],
        ...Object.entries(byValidity).map(([k, v]) => [k, v]),
      ];
      const wsP = XLSX.utils.aoa_to_sheet(pivotRows);
      _styleHeaderRow(wsP, 2);
      wsP["!cols"] = [{ wch: 28 }, { wch: 10 }];
      XLSX.utils.book_append_sheet(wb, wsP, "By Category");

    } else if (result.test_data && typeof result.test_data === "object") {
      // Legacy format: one sheet per category
      const td = result.test_data as Record<string, any[]>;
      let legacySheets = 0;
      for (const [sheetName, data] of Object.entries(td)) {
        if (!Array.isArray(data) || data.length === 0) continue;
        let ws: XLSX.WorkSheet;
        if (typeof data[0] === "object" && data[0] !== null) {
          ws = XLSX.utils.json_to_sheet(data);
          _styleHeaderRow(ws, Object.keys(data[0]).length);
        } else {
          ws = XLSX.utils.aoa_to_sheet([["Value"], ...data.map(v => [v])]);
          _styleHeaderRow(ws, 1);
        }
        XLSX.utils.book_append_sheet(wb, ws, sheetName.replace(/_/g, " ").slice(0, 31));
        legacySheets++;
      }
      // If all legacy arrays were empty, fall through to the key-value dump below
      if (legacySheets === 0) {
        const entries = Object.entries(result).filter(([k]) => !["tokens_used","latency_ms"].includes(k));
        const ws = XLSX.utils.aoa_to_sheet([["Key", "Value"], ...entries.map(([k,v]) => [k, cellStr(v)])]);
        _styleHeaderRow(ws, 2);
        XLSX.utils.book_append_sheet(wb, ws, "Raw Result");
      }
    } else {
      // Neither test_cases nor test_data — dump whatever is in the result
      const entries = Object.entries(result).filter(([k]) => !["tokens_used","latency_ms"].includes(k));
      const ws = XLSX.utils.aoa_to_sheet([["Key", "Value"], ...entries.map(([k,v]) => [k, cellStr(v)])]);
      _styleHeaderRow(ws, 2);
      XLSX.utils.book_append_sheet(wb, ws, "Raw Result");
    }
  } else {
    const { headers, rows } = extractRows(actionId, result);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    _styleHeaderRow(ws, headers.length);
    // Auto column width
    ws["!cols"] = headers.map((h, i) => ({
      wch: Math.max(h.length + 2, ...rows.map(r => (r[i] ?? "").length).slice(0, 50)) + 2,
    }));
    XLSX.utils.book_append_sheet(wb, ws, "Results");
  }

  // Summary sheet if available
  if (result.summary && typeof result.summary === "object") {
    const summaryData = Object.entries(result.summary).map(([k, v]) => ({ Metric: k, Value: cellStr(v) }));
    const ws2 = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, ws2, "Summary");
  }

  XLSX.writeFile(wb, filename ?? `${actionId}.xlsx`);
}

export function downloadXLS(actionId: string, result: any, filename?: string) {
  const wb = XLSX.utils.book_new();
  const { headers, rows } = extractRows(actionId, result);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  XLSX.utils.book_append_sheet(wb, ws, "Results");
  XLSX.writeFile(wb, filename ?? `${actionId}.xls`, { bookType: "xls" });
}

function _styleHeaderRow(ws: XLSX.WorkSheet, colCount: number) {
  // Bold header row cells
  for (let c = 0; c < colCount; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    if (!ws[addr]) continue;
    ws[addr].s = { font: { bold: true }, fill: { fgColor: { rgb: "7C3AED" } } };
  }
}

// ── DOCX ──────────────────────────────────────────────────────────────────────

const BORDER = { style: BorderStyle.SINGLE, size: 1, color: "3F3F46" };
const CELL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

function makeHeaderCell(text: string) {
  return new TableCell({
    borders: CELL_BORDERS,
    shading: { fill: "7C3AED" },
    children: [new Paragraph({
      children: [new TextRun({ text, bold: true, color: "FFFFFF", size: 20 })],
    })],
  });
}

function makeCell(text: string) {
  return new TableCell({
    borders: CELL_BORDERS,
    children: [new Paragraph({
      children: [new TextRun({ text: text.slice(0, 1000), size: 18, color: "D4D4D8" })],
    })],
  });
}

export async function downloadDOCX(actionId: string, result: any, filename?: string) {
  const sections: any[] = [];

  // Title
  sections.push(new Paragraph({
    text: actionIdToLabel(actionId),
    heading: HeadingLevel.HEADING_1,
    spacing: { after: 200 },
  }));

  // Meta
  sections.push(new Paragraph({
    children: [
      new TextRun({ text: `Generated: ${new Date().toLocaleString()}   `, color: "71717A", size: 18 }),
      new TextRun({ text: `Tokens: ${result.tokens_used ?? "—"}   Latency: ${result.latency_ms?.toFixed(0) ?? "—"}ms`, color: "71717A", size: 18 }),
    ],
    spacing: { after: 300 },
  }));

  // Generate Automation Script — output as code block
  if (actionId === "generate_script" && result.script) {
    sections.push(new Paragraph({ text: `Framework: ${result.framework ?? ""}`, heading: HeadingLevel.HEADING_2 }));
    sections.push(new Paragraph({ text: `File: ${result.filename ?? ""}`, spacing: { after: 200 } }));
    for (const line of result.script.split("\n").slice(0, 200)) {
      sections.push(new Paragraph({
        children: [new TextRun({ text: line || " ", font: "Courier New", size: 18, color: "A3E635" })],
        spacing: { after: 0 },
      }));
    }
  }
  // Explain failure — narrative
  else if (actionId === "explain_failure") {
    for (const [key, val] of Object.entries(result)) {
      if (key === "tokens_used" || key === "latency_ms") continue;
      sections.push(new Paragraph({ text: key.replace(/_/g, " ").toUpperCase(), heading: HeadingLevel.HEADING_2, spacing: { after: 100 } }));
      sections.push(new Paragraph({ children: [new TextRun({ text: cellStr(val), size: 20 })], spacing: { after: 200 } }));
    }
  }
  // Table-based results
  else {
    const { headers, rows } = extractRows(actionId, result);
    if (headers.length > 0 && rows.length > 0) {
      const colWidths = headers.map(() => Math.floor(9000 / headers.length));
      const table = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({ children: headers.map(h => makeHeaderCell(h)), tableHeader: true }),
          ...rows.map(row => new TableRow({ children: row.map(c => makeCell(c)) })),
        ],
        columnWidths: colWidths,
      });
      sections.push(table);
    }

    // Summary section
    if (result.summary && typeof result.summary === "object") {
      sections.push(new Paragraph({ text: "Summary", heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 100 } }));
      for (const [k, v] of Object.entries(result.summary)) {
        sections.push(new Paragraph({
          children: [
            new TextRun({ text: `${k.replace(/_/g, " ")}: `, bold: true, size: 20 }),
            new TextRun({ text: cellStr(v), size: 20 }),
          ],
          spacing: { after: 80 },
        }));
      }
    }
  }

  const doc = new Document({
    sections: [{ children: sections }],
    styles: {
      default: {
        document: { run: { color: "E4E4E7", font: "Calibri" } },
      },
    },
  });

  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, filename ?? `${actionId}.docx`);
}

// ── JSON ──────────────────────────────────────────────────────────────────────

export function downloadJSON(actionId: string, result: any, filename?: string) {
  const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
  triggerDownload(blob, filename ?? `${actionId}.json`);
}

// ── JIRA Zephyr Scale export ──────────────────────────────────────────────────
// Industry-standard format: one header row per test case + one row per step.
// Import path: Zephyr Scale → Test Cases → Import CSV
// Ref: https://support.smartbear.com/zephyr-scale-cloud/docs/test-cases/import-and-export-test-cases.html

const _JIRA_PRIORITY: Record<string, string> = {
  Critical: "High", High: "High", Medium: "Medium", Low: "Low",
};

function _testDataStr(td: any): string {
  if (!td || typeof td !== "object") return cellStr(td);
  return Object.entries(td).map(([k, v]) => `${k}: ${v}`).join(" | ");
}

function _precondStr(pre: any): string {
  if (Array.isArray(pre)) return pre.map((p: string, i: number) => `${i + 1}. ${p}`).join("\n");
  return cellStr(pre);
}

export function downloadJIRA(result: any, filename?: string) {
  const tc: any[] = result.test_cases ?? [];
  if (tc.length === 0) return;

  // Zephyr Scale multi-row step format:
  // First row of each TC → all TC fields populated + first step
  // Remaining rows → Name/Folder/etc blank + step columns only
  const headers = [
    "Name", "Status", "Priority", "Type", "Folder", "Label/s",
    "Description", "Precondition",
    "Step No", "Step Description", "Step Test Data", "Step Expected Result",
  ];

  const rows: string[][] = [];

  for (const t of tc) {
    const name = `${t.id} - ${t.summary ?? `${t.feature ?? ""} ${t.category} Validation`}`;
    const priority = _JIRA_PRIORITY[t.priority] ?? "Medium";
    const folder = `/${t.module ?? "Tests"}/${t.feature ?? t.module ?? "General"}`;
    const labels = [
      t.technique?.toLowerCase().replace(/\s+/g, "-"),
      t.category?.toLowerCase().replace(/\s+/g, "-"),
      t.validity,
      ...(t.automation_tags ?? []).map((tag: string) => tag.toLowerCase()),
    ].filter(Boolean).join(", ");
    const desc = [
      t.requirement_id ? `Requirement: ${t.requirement_id}` : null,
      `Module: ${t.module ?? ""}`,
      `Feature: ${t.feature ?? ""}`,
      `Severity: ${t.severity ?? ""}`,
      `Type: ${t.type ?? "Functional"}`,
      `Automation: ${t.automation ?? "Yes"}`,
      t.expected_api ? `API: ${t.expected_api} → ${t.expected_status_code ?? ""}` : null,
      t.post_conditions ? `Post Conditions: ${t.post_conditions}` : null,
      t.expected_db_validation ? `DB: ${t.expected_db_validation}` : null,
      `Traceability: ${t.traceability ?? t.requirement_id ?? ""}`,
      `Owner: ${t.owner ?? "QA Team"}`,
    ].filter(Boolean).join(" | ");
    const precondition = _precondStr(t.preconditions);
    const testDataStr = _testDataStr(t.test_data);

    const steps: any[] = Array.isArray(t.steps) && t.steps.length > 0
      ? t.steps
      : [{ step_no: 1, action: t.summary ?? "", expected_result: t.expected_result ?? "" }];

    steps.forEach((s: any, idx: number) => {
      const isFirst = idx === 0;
      rows.push([
        isFirst ? name : "",
        isFirst ? "Draft" : "",
        isFirst ? priority : "",
        isFirst ? "Manual" : "",
        isFirst ? folder : "",
        isFirst ? labels : "",
        isFirst ? desc : "",
        isFirst ? precondition : "",
        String(s.step_no ?? idx + 1),
        s.action ?? "",
        idx === 0 ? testDataStr : "",   // test data on first step only
        s.expected_result ?? "",
      ]);
    });
  }

  const esc = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [headers.map(esc).join(","), ...rows.map(r => r.map(esc).join(","))];
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, filename ?? "test_cases_jira_zephyr.csv");
}

// ── Azure DevOps (ADO) Test Case export ───────────────────────────────────────
// Format: ADO Work Item CSV import (Boards → Work Items → Import CSV)
// Steps use ADO's parameterizedString XML (renders as proper step table in Test Plans)
// Ref: https://learn.microsoft.com/en-us/azure/devops/boards/queries/import-work-items-from-csv

const _ADO_PRIORITY: Record<string, string> = {
  Critical: "1", High: "2", Medium: "3", Low: "4",
};
const _ADO_SEVERITY: Record<string, string> = {
  Critical: "1 - Critical", High: "2 - High", Medium: "3 - Medium", Low: "4 - Low",
};

function _xmlEsc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function _adoStepsXml(steps: any[], testData: any): string {
  if (!Array.isArray(steps) || steps.length === 0) return "";
  const tdStr = _testDataStr(testData);
  let xml = `<steps id="0" last="${steps.length}">`;
  steps.forEach((s: any, i: number) => {
    const action = i === 0 && tdStr
      ? `${_xmlEsc(s.action ?? "")}<br/><b>Test Data:</b> ${_xmlEsc(tdStr)}`
      : _xmlEsc(s.action ?? "");
    xml += `<step id="${i + 1}" type="ActionStep">`;
    xml += `<parameterizedString isformatted="true">${action}</parameterizedString>`;
    xml += `<parameterizedString isformatted="true">${_xmlEsc(s.expected_result ?? "")}</parameterizedString>`;
    xml += `</step>`;
  });
  xml += `</steps>`;
  return xml;
}

export function downloadADO(result: any, filename?: string) {
  const tc: any[] = result.test_cases ?? [];
  if (tc.length === 0) return;

  const headers = [
    "Work Item Type", "Title", "State", "Priority", "Severity",
    "Area Path", "Iteration Path", "Assigned To", "Tags",
    "Description", "Automation Status", "Automation Identifier",
    "Steps", "Requirements",
  ];

  const rows: string[][] = tc.map(t => {
    const title = `${t.id} - ${t.summary ?? `[${t.technique}] ${t.feature ?? ""} ${t.category} Validation`}`;
    const tags = [
      ...(t.automation_tags ?? []),
      t.technique,
      t.category,
      t.validity,
    ].filter(Boolean).join("; ");
    const desc = [
      `Module: ${t.module ?? ""}`,
      `Feature: ${t.feature ?? ""}`,
      `Severity: ${t.severity ?? ""}`,
      `Type: ${t.type ?? "Functional"}`,
      `Preconditions: ${_precondStr(t.preconditions)}`,
      t.post_conditions ? `Post Conditions: ${t.post_conditions}` : null,
      t.expected_api ? `API: ${t.expected_api} | Status: ${t.expected_status_code ?? ""}` : null,
      t.expected_db_validation ? `DB Validation: ${t.expected_db_validation}` : null,
      `Owner: ${t.owner ?? "QA Team"}`,
    ].filter(Boolean).join("\n");

    const automationStatus = t.automation === "Yes" ? "Automated" : "Not Automated";
    const steps = _adoStepsXml(t.steps ?? [], t.test_data);

    return [
      "Test Case",
      title,
      "Design",
      _ADO_PRIORITY[t.priority] ?? "3",
      _ADO_SEVERITY[t.severity ?? t.priority] ?? "3 - Medium",
      "",   // Area Path — fill in: \ProjectName\QA
      "",   // Iteration Path — fill in: \ProjectName\Sprint 25
      t.owner ?? "QA Team",
      tags,
      desc,
      automationStatus,
      t.id,   // Automation Identifier (maps to script ID)
      steps,
      t.traceability ?? t.requirement_id ?? "",
    ];
  });

  const esc = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [headers.map(esc).join(","), ...rows.map(r => r.map(esc).join(","))];
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, filename ?? "test_cases_ado.csv");
}

// ── Script file export ────────────────────────────────────────────────────────

export function downloadScript(result: any) {
  const script: string = result.script ?? "";
  const ext = (result.framework ?? "").toLowerCase().includes("java") ? "java"
    : (result.framework ?? "").toLowerCase().includes("cypress") ? "cy.js"
    : "spec.ts";
  const filename = result.filename ?? `test.${ext}`;

  // Use data: URI — avoids all blob URL timing/revocation issues
  const dataUri = "data:text/plain;charset=utf-8," + encodeURIComponent(script);
  const a = document.createElement("a");
  a.href = dataUri;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => document.body.removeChild(a), 100);
}

// ── Label helper ──────────────────────────────────────────────────────────────

function actionIdToLabel(id: string): string {
  const map: Record<string, string> = {
    generate_test_cases: "Generated Test Cases",
    find_duplicates: "Duplicate Analysis",
    coverage_analysis: "Coverage Analysis",
    rca: "Root Cause Analysis",
    release_summary: "Release Summary",
    explain_failure: "Failure Explanation",
    automate: "Automation Recommendations",
    generate_script: "Automation Script",
    test_data: "Test Data",
    flaky_analyzer: "Flaky Test Analysis",
  };
  return map[id] ?? id;
}
