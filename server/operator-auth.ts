import type { MiddlewareHandler } from 'hono'
import { verifyOperatorToken } from './tokens'

export type OperatorVariables = {
  operatorId: string
  operatorName: string
  operatorPlatform: 'telegram' | 'discord' | 'anonymous' | 'friskydev'
}

export function createOperatorMiddleware(
  authRequired: boolean
): MiddlewareHandler<{ Variables: OperatorVariables }> {
  return async (c, next) => {
    const header = c.req.header('authorization') || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''

    if (!token) {
      if (authRequired) {
        return c.json({ error: 'Operator token required' }, 401)
      }
      c.set('operatorId', `anonymous:${c.req.header('x-client-id') || 'local'}`)
      c.set('operatorName', 'Anonymous Operator')
      c.set('operatorPlatform', 'anonymous')
      await next()
      return
    }

    const claims = verifyOperatorToken(token)
    if (!claims) {
      return c.json({ error: 'Invalid or expired operator token' }, 401)
    }

    c.set('operatorId', claims.sub)
    c.set('operatorName', claims.name)
    c.set('operatorPlatform', claims.platform)
    await next()
  }
}
