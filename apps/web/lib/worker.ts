export async function workerPost(path: string, body: any) {
  return workerRequest('POST', path, body);
}

export async function workerDelete(path: string) {
  return workerRequest('DELETE', path, undefined);
}

export async function workerGet(path: string) {
  return workerRequest('GET', path, undefined);
}

async function workerRequest(method: 'GET' | 'POST' | 'DELETE', path: string, body?: any) {
  const cleaned = path.startsWith('/') ? path.slice(1) : path;
  const res = await fetch(`/api/worker/${cleaned}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Worker request failed (${res.status})`);
  }
  return res.json();
}
