export async function workerPost(path: string, body: any) {
  const base = process.env.NEXT_PUBLIC_WORKER_URL || '';
  const secret = process.env.NEXT_PUBLIC_ADMIN_API_SECRET || '';
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-secret': secret
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
