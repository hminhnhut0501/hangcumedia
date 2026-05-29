import type { ParsedTelegramLink } from '@repo/shared';

export function parseTelegramLink(input: string): ParsedTelegramLink | null {
  const raw = input.trim();
  const normalized = raw.startsWith('http') ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return null;
  }

  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] === 'c' && parts.length >= 3) {
    const internalId = parts[1];
    const messageId = Number(parts[2]);
    const possibleThreadId = parts[3] ? Number(parts[3]) : undefined;
    if (!Number.isFinite(messageId)) return null;
    return {
      kind: 'private_c',
      chatId: Number(`-100${internalId}`),
      messageId,
      possibleThreadId,
      raw
    };
  }

  if (parts.length >= 2) {
    const username = parts[0];
    const messageId = Number(parts[1]);
    const possibleThreadId = parts[2] ? Number(parts[2]) : undefined;
    if (!Number.isFinite(messageId)) return null;
    return { kind: 'public_username', username, messageId, possibleThreadId, raw };
  }

  return null;
}
