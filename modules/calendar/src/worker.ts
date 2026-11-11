import {
  TenantConfigError,
  createTenantHandler,
  loggedResponse,
  loadTenantConfigFromJson,
  type PublicVars,
  type TenantConfig,
  type WorkerContext,
} from '../../../packages/core/src/index.ts'
import { createCalendarModule, memoryCalendarStore } from './module.ts'

const store = memoryCalendarStore()

export default {
  async fetch(request: Request, env: PublicVars, ctx: WorkerContext): Promise<Response> {
    if (!env.TENANT_CONFIG_JSON) return loggedResponse(request, env, { error: 'tenant_config_missing' }, 503)
    let tenant: TenantConfig
    try {
      tenant = loadTenantConfigFromJson(env.TENANT_CONFIG_JSON)
    } catch (error) {
      if (error instanceof TenantConfigError) return loggedResponse(request, env, { error: 'tenant_config_invalid' }, 500)
      return loggedResponse(request, env, { error: 'internal' }, 500)
    }
    const enabled = tenant.modules.includes('calendar')
    return createTenantHandler({
      tenant,
      modules: enabled ? [createCalendarModule(store)] : [],
      health: { module: 'calendar', enabled },
    }).fetch(request, env, ctx)
  },
}
