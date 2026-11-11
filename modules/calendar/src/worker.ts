import {
  TenantConfigError,
  createTenantHandler,
  json,
  loadTenantConfigFromJson,
  type PublicVars,
  type TenantConfig,
  type WorkerContext,
} from '../../../packages/core/src/index.ts'
import { createCalendarModule, memoryCalendarStore } from './module.ts'

const store = memoryCalendarStore()

export default {
  async fetch(request: Request, env: PublicVars, ctx: WorkerContext): Promise<Response> {
    if (!env.TENANT_CONFIG_JSON) return json({ error: 'tenant_config_missing' }, 503)
    let tenant: TenantConfig
    try {
      tenant = loadTenantConfigFromJson(env.TENANT_CONFIG_JSON)
    } catch (error) {
      if (error instanceof TenantConfigError) return json({ error: 'tenant_config_invalid' }, 500)
      throw error
    }
    if (!tenant.modules.includes('calendar')) return json({ error: 'not_found' }, 404)
    return createTenantHandler({
      tenant,
      modules: [createCalendarModule(store)],
    }).fetch(request, env, ctx)
  },
}
