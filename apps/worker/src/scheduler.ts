import { env } from './config.js';
import { logger } from './logger.js';
import { processDueQueueItems } from './queue.js';

export function startScheduler() {
  const intervalMs = env.SCHEDULER_TICK_SECONDS * 1000;
  logger.info(`Scheduler started with tick ${env.SCHEDULER_TICK_SECONDS}s`);

  setInterval(async () => {
    try {
      await processDueQueueItems();
    } catch (e) {
      logger.error('Scheduler tick failed', e);
    }
  }, intervalMs);
}
