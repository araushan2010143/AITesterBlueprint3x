import cron from 'node-cron';
import { runPipeline } from './pipeline';

let started = false;

export function startScheduler(): void {
  if (started) return;
  started = true;

  // Run every day at 09:00 local time
  cron.schedule('0 9 * * *', async () => {
    console.log('[Scheduler] 09:00 trigger — starting pipeline');
    await runPipeline();
  });

  console.log('[Scheduler] Started — pipeline will run daily at 09:00');
}
