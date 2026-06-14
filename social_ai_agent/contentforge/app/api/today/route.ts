import { NextResponse } from 'next/server';
import { excelManager } from '../../../lib/excelManager';
import { todayDate } from '../../../lib/agents';

export async function GET(): Promise<NextResponse> {
  try {
    const today = todayDate();
    const row = await excelManager.readByDate(today);
    if (!row) {
      return NextResponse.json({ ok: true, row: null, date: today });
    }
    return NextResponse.json({ ok: true, row, date: today });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
