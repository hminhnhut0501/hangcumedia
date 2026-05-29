import express from 'express';
import cors from 'cors';
import { env } from './config.js';
import { registerRoutes } from './routes.js';
import { bot } from './bot.js';
import { startScheduler } from './scheduler.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

registerRoutes(app);

const port = Number(process.env.PORT || 4000);

async function bootstrap() {
  await bot.telegram.setWebhook(`${env.PUBLIC_WORKER_URL}/telegram/webhook/${env.TELEGRAM_WEBHOOK_SECRET}`);
  startScheduler();
  app.listen(port, () => {
    console.log(`worker listening on :${port}`);
  });
}

bootstrap().catch((e) => {
  console.error(e);
  process.exit(1);
});
