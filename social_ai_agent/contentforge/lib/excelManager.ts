import ExcelJS from 'exceljs';
import path from 'path';
import type { ContentRow, ContentStatus } from './types';

const EXCEL_PATH = path.join(process.cwd(), 'content_calendar.xlsx');

// Column header → ContentRow key mapping
const COL_MAP: Record<string, keyof ContentRow> = {
  Date: 'date',
  Topic: 'topic',
  'LinkedIn POST': 'linkedinPost',
  'Medium Article': 'mediumArticle',
  'IG Script': 'igScript',
  'YT Script': 'ytScript',
  'Dev.to Article': 'devtoArticle',
  Status: 'status',
  'LinkedIn Image': 'linkedinImage',
  'Medium Image': 'mediumImage',
  'IG Image': 'igImage',
  'Last Updated': 'lastUpdated',
  'Updated By': 'updatedBy',
};

const HEADERS = Object.keys(COL_MAP);

// Mutex: only one write at a time
let writeLock = false;
const writeQueue: Array<() => void> = [];

function acquireLock(): Promise<void> {
  return new Promise((resolve) => {
    if (!writeLock) {
      writeLock = true;
      resolve();
    } else {
      writeQueue.push(resolve);
    }
  });
}

function releaseLock(): void {
  const next = writeQueue.shift();
  if (next) {
    next();
  } else {
    writeLock = false;
  }
}

async function loadWorkbook(): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.readFile(EXCEL_PATH);
  } catch {
    // File doesn't exist yet — bootstrap it
    const ws = wb.addWorksheet('Content Calendar');
    ws.addRow(HEADERS);
    ws.getRow(1).font = { bold: true };
    await wb.xlsx.writeFile(EXCEL_PATH);
  }
  return wb;
}

function getOrCreateSheet(wb: ExcelJS.Workbook): ExcelJS.Worksheet {
  return wb.getWorksheet('Content Calendar') ?? wb.addWorksheet('Content Calendar');
}

function rowToContentRow(row: ExcelJS.Row, headerIndex: Map<string, number>): ContentRow {
  const get = (col: string): string => {
    const idx = headerIndex.get(col);
    if (idx === undefined) return '';
    const cell = row.getCell(idx);
    const v = cell.value;
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return v.toISOString().split('T')[0] ?? '';
    return String(v);
  };

  return {
    date: get('Date'),
    topic: get('Topic'),
    linkedinPost: get('LinkedIn POST'),
    mediumArticle: get('Medium Article'),
    igScript: get('IG Script'),
    ytScript: get('YT Script'),
    devtoArticle: get('Dev.to Article'),
    status: (get('Status') || 'Pending') as ContentStatus,
    linkedinImage: get('LinkedIn Image'),
    mediumImage: get('Medium Image'),
    igImage: get('IG Image'),
    lastUpdated: get('Last Updated'),
    updatedBy: get('Updated By'),
  };
}

function buildHeaderIndex(ws: ExcelJS.Worksheet): Map<string, number> {
  const map = new Map<string, number>();
  const headerRow = ws.getRow(1);
  headerRow.eachCell((cell, colNum) => {
    const v = cell.value;
    if (typeof v === 'string') map.set(v, colNum);
  });
  // Ensure all required headers exist
  HEADERS.forEach((h) => {
    if (!map.has(h)) {
      const colNum = (ws.columnCount ?? 0) + 1;
      ws.getCell(1, colNum).value = h;
      map.set(h, colNum);
    }
  });
  return map;
}

export class ExcelManager {
  async readAll(): Promise<ContentRow[]> {
    const wb = await loadWorkbook();
    const ws = getOrCreateSheet(wb);
    const headerIndex = buildHeaderIndex(ws);
    const rows: ContentRow[] = [];

    ws.eachRow((row, rowNum) => {
      if (rowNum === 1) return; // skip header
      const cr = rowToContentRow(row, headerIndex);
      if (cr.date || cr.topic) rows.push(cr);
    });

    return rows;
  }

  async readByDate(date: string): Promise<ContentRow | null> {
    const all = await this.readAll();
    return all.find((r) => r.date === date) ?? null;
  }

  async appendRow(row: Partial<ContentRow> & { date: string; topic: string }): Promise<void> {
    await acquireLock();
    try {
      const wb = await loadWorkbook();
      const ws = getOrCreateSheet(wb);
      const headerIndex = buildHeaderIndex(ws);

      const newRow: Record<string, string> = {
        Date: row.date,
        Topic: row.topic,
        'LinkedIn POST': '',
        'Medium Article': '',
        'IG Script': '',
        'YT Script': '',
        'Dev.to Article': '',
        Status: row.status ?? 'Pending',
        'LinkedIn Image': '',
        'Medium Image': '',
        'IG Image': '',
        'Last Updated': new Date().toISOString(),
        'Updated By': 'Agent1-TopicGenerator',
      };

      const cells: string[] = [];
      headerIndex.forEach((colNum, header) => {
        cells[colNum - 1] = newRow[header] ?? '';
      });

      ws.addRow(cells);
      await wb.xlsx.writeFile(EXCEL_PATH);
    } finally {
      releaseLock();
    }
  }

  async updateRow(date: string, updates: Partial<ContentRow>): Promise<void> {
    await acquireLock();
    try {
      const wb = await loadWorkbook();
      const ws = getOrCreateSheet(wb);
      const headerIndex = buildHeaderIndex(ws);

      let targetRowNum = -1;
      ws.eachRow((row, rowNum) => {
        if (rowNum === 1) return;
        const dateIdx = headerIndex.get('Date');
        if (!dateIdx) return;
        const cellVal = row.getCell(dateIdx).value;
        const cellDate =
          cellVal instanceof Date
            ? cellVal.toISOString().split('T')[0]
            : String(cellVal ?? '');
        if (cellDate === date) targetRowNum = rowNum;
      });

      if (targetRowNum === -1) {
        console.warn(`[ExcelManager] No row found for date ${date}`);
        return;
      }

      const row = ws.getRow(targetRowNum);
      const reverseMap = new Map<keyof ContentRow, string>(
        Object.entries(COL_MAP).map(([header, key]) => [key, header])
      );

      for (const [key, value] of Object.entries(updates) as [keyof ContentRow, string][]) {
        const header = reverseMap.get(key);
        if (!header) continue;
        const colNum = headerIndex.get(header);
        if (!colNum) continue;
        row.getCell(colNum).value = value;
      }

      // Always stamp last-updated
      const luIdx = headerIndex.get('Last Updated');
      if (luIdx) row.getCell(luIdx).value = new Date().toISOString();

      row.commit();
      await wb.xlsx.writeFile(EXCEL_PATH);
    } finally {
      releaseLock();
    }
  }

  getFilePath(): string {
    return EXCEL_PATH;
  }
}

export const excelManager = new ExcelManager();
