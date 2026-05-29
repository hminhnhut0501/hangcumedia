import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const EnvSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  PUBLIC_WORKER_URL: z.string().url(),
  APP_TIMEZONE: z.string().default('Asia/Ho_Chi_Minh'),
  SCHEDULER_TICK_SECONDS: z.coerce.number().int().positive().default(30),
  MAX_LATE_SECONDS: z.coerce.number().int().nonnegative().default(60),
  ADMIN_API_SECRET: z.string().min(1)
});

export const env = EnvSchema.parse(process.env);
