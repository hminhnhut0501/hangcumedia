import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

function buildWorkerUrl(parts: string[]) {
  const base = process.env.WORKER_URL;
  if (!base) throw new Error('Missing WORKER_URL');
  const joined = parts.join('/');
  return `${base.replace(/\/$/, '')}/${joined}`;
}

async function proxy(method: 'POST' | 'DELETE', req: NextRequest, parts: string[]) {
  try {
    const adminSecret = process.env.ADMIN_API_SECRET;
    if (!adminSecret) {
      return NextResponse.json({ error: 'Missing ADMIN_API_SECRET' }, { status: 500 });
    }

    const url = buildWorkerUrl(parts);
    const rawBody = method === 'DELETE' ? undefined : await req.text();
    const resp = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': adminSecret
      },
      body: rawBody && rawBody.length > 0 ? rawBody : undefined,
      cache: 'no-store'
    });

    const text = await resp.text();
    const contentType = resp.headers.get('content-type') || 'application/json';

    return new NextResponse(text, {
      status: resp.status,
      headers: { 'Content-Type': contentType }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Proxy error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy('POST', req, path);
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy('DELETE', req, path);
}
