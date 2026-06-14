import { agent1GenerateTopic, agent2WriteContent, agent3GenerateImages } from './agents';
import type { PipelineStatus } from './types';

// Singleton pipeline state
const state: PipelineStatus = {
  running: false,
  currentStep: 'idle',
  lastRun: null,
  lastError: null,
};

export function getPipelineStatus(): PipelineStatus {
  return { ...state };
}

export async function runPipeline(): Promise<void> {
  if (state.running) {
    console.log('[Pipeline] Already running, skipping');
    return;
  }

  state.running = true;
  state.lastError = null;
  state.lastRun = new Date().toISOString();

  try {
    state.currentStep = 'Agent1: Generating topic';
    console.log('[Pipeline] Step 1 — Topic generation');
    const topic = await agent1GenerateTopic();

    state.currentStep = 'Agent2: Writing content';
    console.log('[Pipeline] Step 2 — Content writing');
    await agent2WriteContent(topic);

    state.currentStep = 'Agent3: Generating images';
    console.log('[Pipeline] Step 3 — Image generation');
    await agent3GenerateImages(topic);

    state.currentStep = 'Done';
    console.log('[Pipeline] Complete');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    state.lastError = msg;
    state.currentStep = 'Error';
    console.error('[Pipeline] Error:', msg);
  } finally {
    state.running = false;
  }
}
