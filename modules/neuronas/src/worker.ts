import {
  TenantConfigError,
  createTenantHandler,
  loggedResponse,
  loadTenantConfigFromJson,
  type PublicVars,
  type TenantConfig,
  type WorkerContext,
} from '../../../packages/core/src/index.ts'
import { createNeuronasModule, memoryNeuronasStore } from './module.ts'

const store = memoryNeuronasStore()

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
    const enabled = tenant.modules.includes('neuronas')
    return createTenantHandler({
      tenant,
      modules: enabled ? [createNeuronasModule(store)] : [],
      health: { module: 'neuronas', enabled },
    }).fetch(request, env, ctx)
  },
}
