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

  if (actionId === "generate_test_cases") arr = result.test_cases;
  else if (actionId === "find_duplicates")  arr = result.duplicate_groups ?? result.duplicates ?? result.groups;
  else if (actionId === "coverage_analysis") arr = result.coverage ?? result.requirements ?? result.gaps;
  else if (actionId === "rca")              arr = result.root_causes;
  else if (actionId === "automate")         arr = result.recommendations;
  else if (actionId === "test_data") {
    return { headers: [], rows: [] };
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
    const noDataRow = arr !== null && arr.length === 0
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

  if (actionId === "test_data" && result.test_data) {
    // Multiple sheets
    const td = result.test_data;
    for (const [sheetName, data] of Object.entries(td)) {
      if (!Array.isArray(data) || data.length === 0) continue;
      const ws = XLSX.utils.json_to_sheet(data as any[]);
      _styleHeaderRow(ws, Object.keys((data as any[])[0]).length);
      XLSX.utils.book_append_sheet(wb, ws, sheetName.replace(/_/g, " ").slice(0, 31));
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
