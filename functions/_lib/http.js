export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export function errorJson(status, code, messageTh) {
  return json({ error: { code, message: messageTh } }, status);
}
