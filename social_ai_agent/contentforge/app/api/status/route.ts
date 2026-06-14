import { NextResponse } from 'next/server';
import { getPipelineStatus } from '../../../lib/pipeline';
import { checkApiKeys } from '../../../lib/agents';
import type { StatusResponse } from '../../../lib/types';

function nextRunTime(): string {
  const now = new Date();
  const next = new Date(now);
  next.setHours(9, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.toISOString();
}

export async function GET(): Promise<NextResponse> {
  try {
    const [pipeline, keys] = await Promise.all([
      getPipelineStatus(),
      checkApiKeys(),
    ]);

    const response: StatusResponse = {
      pipeline,
      keys,
      nextRun: nextRunTime(),
    };

    return NextResponse.json(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
