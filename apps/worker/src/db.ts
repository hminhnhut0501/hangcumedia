import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { env } from './config.js';

// Supabase Realtime internally expects a WebSocket constructor in Node 20.
if (!(globalThis as any).WebSocket) {
  (globalThis as any).WebSocket = WebSocket;
}

export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});
