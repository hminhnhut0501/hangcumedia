import express from 'express';
import cors from 'cors';
import { env } from './config.js';
import { registerRoutes } from './routes.js';
import { bot } from './bot.js';
import { startScheduler } from './scheduler.js';
import { logger } from './logger.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

registerRoutes(app);

const port = Number(process.env.PORT || 4000);

async function bootstrap() {
  const webhookUrl = `${env.PUBLIC_WORKER_URL}/telegram/webhook/${env.TELEGRAM_WEBHOOK_SECRET}`;
  await bot.telegram.setWebhook(webhookUrl, { drop_pending_updates: false });
  logger.info('telegram webhook configured', { webhookUrl });
  startScheduler();
  app.listen(port, () => {
    logger.info(`worker listening on :${port}`);
  });
}

bootstrap().catch((e) => {
  console.error(e);
  process.exit(1);
});
