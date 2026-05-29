export async function workerPost(path: string, body: any) {
  return workerRequest('POST', path, body);
}

export async function workerDelete(path: string) {
  return workerRequest('DELETE', path, undefined);
}

async function workerRequest(method: string, path: string, body?: any) {
  const base = process.env.NEXT_PUBLIC_WORKER_URL || '';
  const secret = process.env.NEXT_PUBLIC_ADMIN_API_SECRET || '';
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-secret': secret
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
