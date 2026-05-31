import { env } from './config.js';
import { logger } from './logger.js';
import { generateQueueForCampaign, processDueQueueItems } from './queue.js';
import { reconcileAllBackupSources } from './reconcile.js';
import { processBackfillTick } from './backfill.js';

export function startScheduler() {
  const intervalMs = env.SCHEDULER_TICK_SECONDS * 1000;
  const reconcileMs = env.RECONCILE_INTERVAL_MINUTES * 60 * 1000;
  logger.info(`Scheduler started with tick ${env.SCHEDULER_TICK_SECONDS}s`);
  logger.info(`Reconcile job started with interval ${env.RECONCILE_INTERVAL_MINUTES}m`);

  setInterval(async () => {
    try {
      // Auto-generate queue for active campaigns before processing due items.
      await generateQueueForCampaign();
      await processDueQueueItems();
      await processBackfillTick();
    } catch (e) {
      logger.error('Scheduler tick failed', e);
    }
  }, intervalMs);

  const runReconcile = async () => {
    try {
      const results = await reconcileAllBackupSources(env.MAX_RECONCILE_SCAN_IDS);
      logger.info('hourly reconcile completed', { groups: results.length });
    } catch (e) {
      logger.error('hourly reconcile failed', e);
    }
  };

  void runReconcile();
  setInterval(runReconcile, reconcileMs);
}
