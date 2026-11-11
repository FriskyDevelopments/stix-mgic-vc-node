export function json(data: unknown, status = 200, extra?: Record<string, string>): Response {
  const headers = new Headers(extra)
  headers.set('content-type', 'application/json; charset=utf-8')
  headers.set('cache-control', 'no-store')
  return new Response(JSON.stringify(data), { status, headers })
}

export async function readJson(
  request: Request,
  maxBytes = 10_000,
): Promise<{ ok: true; value: unknown } | { ok: false; error: 'invalid_json' | 'body_too_large'; status: number }> {
  const raw = await request.text()
  if (raw.length > maxBytes) return { ok: false, error: 'body_too_large', status: 413 }
  try {
    return { ok: true, value: JSON.parse(raw) as unknown }
  } catch {
    return { ok: false, error: 'invalid_json', status: 400 }
  }
}

export function stamp(response: Response, requestId: string, tenantId: string): Response {
  const headers = new Headers(response.headers)
  headers.set('x-request-id', requestId)
  headers.set('x-tenant', tenantId)
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}
