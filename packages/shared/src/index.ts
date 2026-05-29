import { z } from 'zod';

export const CampaignInputSchema = z.object({
  name: z.string().min(1),
  source_group_id: z.string().uuid().nullable().optional(),
  target_group_id: z.string().uuid(),
  target_topic_id: z.string().uuid().nullable().optional(),
  copy_mode: z.enum(['copy', 'forward']).default('copy'),
  media_group_mode: z.enum(['keep', 'split']).default('keep'),
  batch_size: z.number().int().positive().default(1),
  runs_per_day: z.number().int().positive().default(1),
  run_times: z.array(z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/)).default(['21:00']),
  timezone: z.string().default('Asia/Ho_Chi_Minh'),
  random_delay_seconds: z.number().int().min(0).default(0),
  status: z.enum(['active', 'paused', 'archived']).default('active')
});

export type CampaignInput = z.infer<typeof CampaignInputSchema>;

export type ParsedTelegramLink = {
  kind: 'private_c' | 'public_username';
  chatId?: number;
  username?: string;
  messageId: number;
  possibleThreadId?: number;
  raw: string;
};

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
