import { json, stamp } from './http.ts'
import type { ModuleId, TenantConfig } from './schema.ts'
import { themeTokens } from './theme.ts'

export interface WorkerContext {
  waitUntil(promise: Promise<unknown>): void
}

export interface PublicVars {
  TENANT_ID?: string
  LOG_LEVEL?: string
  TENANT_CONFIG_JSON?: string
}

export interface RequestContext {
  tenant: TenantConfig
  requestId: string
  now: Date
  clock: () => Date
  health?: Record<string, string | boolean>
}

export interface ModuleRoute {
  id: ModuleId
  prefix: string
  handle(request: Request, ctx: RequestContext): Promise<Response>
}

export interface TenantWorker {
  fetch(request: Request, env: PublicVars, ctx: WorkerContext): Promise<Response>
}

export function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1)
  return pathname
}

export function routeTail(pathname: string, prefix: string): string | null {
  const path = normalizePath(pathname)
  if (path === prefix) return '/'
  if (path.startsWith(`${prefix}/`)) return path.slice(prefix.length)
  return null
}

export function tenantManifest(tenant: TenantConfig, modules: readonly ModuleRoute[]) {
  return {
    tenant: {
      id: tenant.id,
      brandName: tenant.brandName,
      tagline: tenant.tagline,
      locale: tenant.locale,
      timeZone: tenant.timeZone,
      currency: tenant.currency,
      modules: tenant.modules,
      hoursConfirmed: tenant.calendar?.hoursConfirmed ?? null,
    },
    theme: themeTokens(tenant),
    routes: modules
      .filter((mod) => tenant.modules.includes(mod.id))
      .map((mod) => ({ id: mod.id, prefix: mod.prefix })),
  }
}

const LOG_SEGMENTS = new Set([
  'calendar',
  'bookings',
  'cancel',
  'services',
  'availability',
  'neuronas',
  'notes',
  'healthz',
])

export function logPath(pathname: string): string {
  return normalizePath(pathname)
    .split('/')
    .map((part) => (part === '' || LOG_SEGMENTS.has(part) ? part : ':id'))
    .join('/')
}

export function loggedResponse(
  request: Request,
  env: PublicVars,
  body: unknown,
  status: number,
  tenantId = '',
): Response {
  const requestId = crypto.randomUUID()
  if (env.LOG_LEVEL !== 'silent') {
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      requestId,
      tenant: tenantId || null,
      method: request.method,
      path: logPath(new URL(request.url).pathname),
      status,
    }))
  }
  return stamp(json(body, status), requestId, tenantId)
}

export function createTenantHandler(options: {
  tenant: TenantConfig
  modules: readonly ModuleRoute[]
  now?: () => Date
  health?: Record<string, string | boolean>
}): TenantWorker {
  const tenant = options.tenant
  const modules = [...options.modules].sort((a, b) => b.prefix.length - a.prefix.length)
  const now = options.now ?? (() => new Date())
  return {
    async fetch(request, env, _ctx) {
      const requestId = crypto.randomUUID()
      const started = now()
      const mismatch = Boolean(env.TENANT_ID && env.TENANT_ID !== tenant.id)
      let response: Response
      try {
        if (mismatch) {
          response = json({ error: 'tenant_mismatch' }, 503)
        } else {
          response = await routeRequest(request, {
            tenant,
            requestId,
            now: started,
            clock: now,
            health: options.health,
          }, modules)
        }
      } catch (error) {
        console.error(JSON.stringify({
          ts: started.toISOString(),
          requestId,
          tenant: tenant.id,
          error: error instanceof Error ? error.name : 'Error',
        }))
        response = json({ error: 'internal' }, 500)
      }
      if (env.LOG_LEVEL !== 'silent') {
        console.log(JSON.stringify({
          ts: started.toISOString(),
          requestId,
          tenant: mismatch ? null : tenant.id,
          method: request.method,
          path: logPath(new URL(request.url).pathname),
          status: response.status,
        }))
      }
      return stamp(response, requestId, mismatch ? '' : tenant.id)
    },
  }
}

export async function routeRequest(
  request: Request,
  ctx: RequestContext,
  modules: readonly ModuleRoute[],
): Promise<Response> {
  const path = normalizePath(new URL(request.url).pathname)
  if (path === '/healthz') {
    if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, { allow: 'GET' })
    return json({ ...ctx.health, ok: true, tenant: ctx.tenant.id })
  }
  if (path === '/') {
    if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, { allow: 'GET' })
    return json(tenantManifest(ctx.tenant, modules))
  }
  for (const mod of modules) {
    if (routeTail(path, mod.prefix) === null) continue
    if (!ctx.tenant.modules.includes(mod.id)) return json({ error: 'not_found' }, 404)
    return mod.handle(request, ctx)
  }
  return json({ error: 'not_found' }, 404)
}
