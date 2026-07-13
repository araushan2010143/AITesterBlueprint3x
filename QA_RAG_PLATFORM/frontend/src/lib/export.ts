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

  // test_data: flat test_cases array (new format) or legacy category map
  if (actionId === "test_data") {
    // New format: flat test_cases array with full technique metadata
    const tc = result.test_cases;
    if (Array.isArray(tc) && tc.length > 0) {
      const headers = Object.keys(tc[0]);
      const rows = (tc as any[]).map(item => headers.map(h => cellStr(item[h])));
      return { headers, rows };
    }
    // Legacy format: nested test_data object
    const td = result.test_data;
    if (!td || typeof td !== "object") return { headers: ["Category", "Value"], rows: [] };
    const rows: string[][] = [];
    for (const [category, items] of Object.entries(td)) {
      if (!Array.isArray(items)) continue;
      for (const item of items as any[]) {
        rows.push([
          category.replace(/_/g, " "),
          typeof item === "object" && item !== null ? JSON.stringify(item) : String(item),
        ]);
      }
    }
    return { headers: ["Category", "Value"], rows };
  }

  if (actionId === "generate_test_cases") arr = result.test_cases;
  else if (actionId === "find_duplicates")  arr = result.duplicate_groups ?? result.duplicates ?? result.groups;
  else if (actionId === "coverage_analysis") arr = result.coverage ?? result.requirements ?? result.gaps;
  else if (actionId === "rca")              arr = result.root_causes;
  else if (actionId === "automate")         arr = result.recommendations;

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

  if (actionId === "test_data") {
    const tc = result.test_cases as any[] | undefined;
    if (Array.isArray(tc) && tc.length > 0) {
      // Sheet 1: All Test Cases (flat)
      const ws = XLSX.utils.json_to_sheet(tc);
      _styleHeaderRow(ws, Object.keys(tc[0]).length);
      const colKeys = Object.keys(tc[0]);
      ws["!cols"] = colKeys.map((k) => ({
        wch: Math.max(k.length + 2, ...tc.map(r => cellStr(r[k]).length).slice(0, 100)) + 2,
      }));
      XLSX.utils.book_append_sheet(wb, ws, "Test Cases");

      // Sheet 2: By Category pivot
      const byCategory: Record<string, number> = {};
      const byTechnique: Record<string, number> = {};
      const byValidity: Record<string, number> = { valid: 0, invalid: 0 };
      for (const c of tc) {
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
      const ws2 = XLSX.utils.aoa_to_sheet(pivotRows);
      _styleHeaderRow(ws2, 2);
      ws2["!cols"] = [{ wch: 28 }, { wch: 10 }];
      XLSX.utils.book_append_sheet(wb, ws2, "By Category");
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
// Format: https://support.smartbear.com/zephyr-scale-cloud/docs/test-cases/import-and-export-test-cases.html
// One row per test case. Imports directly into Zephyr Scale as Manual test cases.

const _JIRA_PRIORITY: Record<string, string> = {
  Critical: "High", High: "High", Medium: "Medium", Low: "Low",
};

export function downloadJIRA(result: any, filename?: string) {
  const tc: any[] = result.test_cases ?? [];
  if (tc.length === 0) return;

  const headers = [
    "Name", "Status", "Priority", "Type",
    "Folder", "Label/s", "Description",
    "Step No", "Step Description", "Step Test Data", "Step Expected Result",
  ];

  const rows: string[][] = tc.map((t) => [
    `${t.id} - ${t.field} - ${t.category} Validation`,           // Name
    "Draft",                                                       // Status
    _JIRA_PRIORITY[t.priority] ?? "Medium",                       // Priority
    "Manual",                                                      // Type
    `/Test Data/${t.field}`,                                       // Folder
    [
      t.technique.toLowerCase().replace(/\s+/g, "-"),
      t.category.toLowerCase().replace(/\s+/g, "-"),
      t.validity,
      "regression",
    ].join(", "),                                                  // Label/s
    `Technique: ${t.technique} | Risk: ${t.risk || "N/A"} | Validity: ${t.validity}`, // Description
    "1",                                                           // Step No
    `Enter the following value in the "${t.field}" field`,        // Step Description
    t.value !== "" && t.value !== undefined ? String(t.value) : "(empty string)", // Step Test Data
    t.expected_result,                                             // Step Expected Result
  ]);

  const esc = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [headers.map(esc).join(","), ...rows.map(r => r.map(esc).join(","))];
  // BOM so Excel opens it correctly on all locales
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, filename ?? "test_data_jira_zephyr.csv");
}

// ── Azure DevOps (ADO) Test Case export ───────────────────────────────────────
// Format: ADO Boards CSV import for Work Item Type = "Test Case"
// Steps use ADO's parameterizedString XML schema (renders as proper steps in Test Plans)

const _ADO_PRIORITY: Record<string, string> = {
  Critical: "1", High: "2", Medium: "3", Low: "4",
};

function _xmlEsc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function _adoSteps(action: string, expected: string, stepId = 1): string {
  return (
    `<steps id="0" last="${stepId}">` +
    `<step id="${stepId}" type="ActionStep">` +
    `<parameterizedString isformatted="true">${_xmlEsc(action)}</parameterizedString>` +
    `<parameterizedString isformatted="true">${_xmlEsc(expected)}</parameterizedString>` +
    `</step></steps>`
  );
}

export function downloadADO(result: any, filename?: string) {
  const tc: any[] = result.test_cases ?? [];
  if (tc.length === 0) return;

  const headers = [
    "Work Item Type", "Title", "State", "Priority",
    "Area Path", "Tags", "Assigned To",
    "Description", "Steps",
  ];

  const rows: string[][] = tc.map(t => {
    const title = `${t.id} - [${t.technique}] ${t.field} - ${t.category} Validation`;
    const tags = [t.technique, t.category, t.validity, "test-data"].join("; ");
    const desc = `Field: ${t.field} | Category: ${t.category} | Technique: ${t.technique} | Validity: ${t.validity} | Risk: ${t.risk || "N/A"}`;
    const testVal = t.value !== "" && t.value !== undefined ? String(t.value) : "(empty string)";
    const action = `Enter the following value in the "${t.field}" field:\n${testVal}`;
    const steps = _adoSteps(action, t.expected_result);
    return [
      "Test Case",
      title,
      "Design",
      _ADO_PRIORITY[t.priority] ?? "3",
      "",   // Area Path — user fills in their project path
      tags,
      "",   // Assigned To
      desc,
      steps,
    ];
  });

  const esc = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [headers.map(esc).join(","), ...rows.map(r => r.map(esc).join(","))];
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, filename ?? "test_data_ado.csv");
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
  };
  return map[id] ?? id;
}
