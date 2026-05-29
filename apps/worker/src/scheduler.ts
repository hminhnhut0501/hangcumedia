import { env } from './config.js';
import { logger } from './logger.js';
import { generateQueueForCampaign, processDueQueueItems } from './queue.js';

export function startScheduler() {
  const intervalMs = env.SCHEDULER_TICK_SECONDS * 1000;
  logger.info(`Scheduler started with tick ${env.SCHEDULER_TICK_SECONDS}s`);

  setInterval(async () => {
    try {
      // Auto-generate queue for active campaigns before processing due items.
      await generateQueueForCampaign();
      await processDueQueueItems();
    } catch (e) {
      logger.error('Scheduler tick failed', e);
    }
  }, intervalMs);
}
