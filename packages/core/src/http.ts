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
  const declared = request.headers.get('content-length')
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    return { ok: false, error: 'body_too_large', status: 413 }
  }
  const raw = await readBoundedText(request, maxBytes)
  if (raw === null) return { ok: false, error: 'body_too_large', status: 413 }
  try {
    return { ok: true, value: JSON.parse(raw) as unknown }
  } catch {
    return { ok: false, error: 'invalid_json', status: 400 }
  }
}

async function readBoundedText(request: Request, maxBytes: number): Promise<string | null> {
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

export function stamp(response: Response, requestId: string, tenantId: string): Response {
  const headers = new Headers(response.headers)
  headers.set('x-request-id', requestId)
  headers.set('x-tenant', tenantId)
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}
