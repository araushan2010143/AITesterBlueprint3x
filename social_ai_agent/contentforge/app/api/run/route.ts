import { NextResponse } from 'next/server';
import { runPipeline, getPipelineStatus } from '../../../lib/pipeline';

export async function POST(): Promise<NextResponse> {
  const current = getPipelineStatus();
  if (current.running) {
    return NextResponse.json(
      { error: 'Pipeline is already running', status: current },
      { status: 409 }
    );
  }

  // Fire and forget — client polls /api/status for progress
  runPipeline().catch((err) => {
    console.error('[api/run] Unhandled pipeline error:', err);
  });

  return NextResponse.json({ ok: true, message: 'Pipeline started' });
}
