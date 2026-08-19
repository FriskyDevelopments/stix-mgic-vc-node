import { getAppEnv } from '@/lib/env'
import { getClientId } from '@/lib/client-id'
import { getOperatorToken } from '@/lib/operator-token'

export function apiUrl(path: string): string {
  return `${getAppEnv().apiBaseUrl}${path}`
}

export function apiHeaders(
  initialHeaders?: HeadersInit,
  includeOperatorToken = true
): Headers {
  const headers = new Headers(initialHeaders)
  headers.set('Content-Type', 'application/json')
  headers.set('X-Client-Id', getClientId())

  if (includeOperatorToken) {
    const token = getOperatorToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }

  return headers
}
