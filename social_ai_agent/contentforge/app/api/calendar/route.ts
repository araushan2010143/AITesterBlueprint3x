import { NextResponse } from 'next/server';
import { excelManager } from '../../../lib/excelManager';

export async function GET(): Promise<NextResponse> {
  try {
    const rows = await excelManager.readAll();
    return NextResponse.json({ ok: true, rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
