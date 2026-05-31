import { env } from './config.js';
import { logger } from './logger.js';
import { generateQueueForCampaign, processDueQueueItems } from './queue.js';
import { reconcileAllBackupSources } from './reconcile.js';
import { processBackfillTick } from './backfill.js';
import { supabase } from './db.js';

let settingsCache: { at: number; reconcileIntervalMinutes: number } | null = null;
let lastReconcileAt = 0;

async function getReconcileIntervalMinutes() {
  const now = Date.now();
  if (settingsCache && now - settingsCache.at < 30_000) return settingsCache.reconcileIntervalMinutes;
  let interval = env.RECONCILE_INTERVAL_MINUTES;
  try {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'reconcile_interval_minutes')
      .maybeSingle();
    const value = Number((data as any)?.value);
    if (Number.isFinite(value) && value > 0) interval = value;
  } catch {
    interval = env.RECONCILE_INTERVAL_MINUTES;
  }
  settingsCache = { at: now, reconcileIntervalMinutes: interval };
  return interval;
}

export function startScheduler() {
  const intervalMs = env.SCHEDULER_TICK_SECONDS * 1000;
  logger.info(`Scheduler started with tick ${env.SCHEDULER_TICK_SECONDS}s`);
  logger.info(`Reconcile job started with dynamic interval from app_settings`);

  setInterval(async () => {
    try {
      // Auto-generate queue for active campaigns before processing due items.
      await generateQueueForCampaign();
      await processDueQueueItems();
      await processBackfillTick();

      const intervalMin = await getReconcileIntervalMinutes();
      const now = Date.now();
      if (lastReconcileAt === 0 || now - lastReconcileAt >= intervalMin * 60 * 1000) {
        const results = await reconcileAllBackupSources(env.MAX_RECONCILE_SCAN_IDS);
        logger.info('dynamic reconcile completed', { groups: results.length, intervalMin });
        lastReconcileAt = now;
      }
    } catch (e) {
      logger.error('Scheduler tick failed', e);
    }
  }, intervalMs);
}
