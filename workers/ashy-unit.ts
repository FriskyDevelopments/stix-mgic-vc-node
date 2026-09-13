import { Container, getContainer } from '@cloudflare/containers'
import { env } from 'cloudflare:workers'
import {
  ASHY_CONTAINER_PORT,
  ASHY_UNIT_INSTANCE_NAME,
  buildAshyContainerEnv,
} from './container-env'

/**
 * Durable Object + Container that runs the existing Node Dockerfile.
 * `/units/ashy`, host chrome, signalling WebSocket, and `/healthz` all live in the image.
 */
export class AshyUnit extends Container {
  defaultPort = ASHY_CONTAINER_PORT
  requiredPorts = [ASHY_CONTAINER_PORT]
  sleepAfter = '1h'
  enableInternet = true
  pingEndpoint = 'localhost/healthz'
  envVars = buildAshyContainerEnv(env)

  override onStart(): void {
    console.log(
      JSON.stringify({
        scope: 'ashy-unit',
        message: 'container started',
        data: { instance: ASHY_UNIT_INSTANCE_NAME, port: ASHY_CONTAINER_PORT },
      }),
    )
  }

  override onStop(params: { exitCode: number; reason: string }): void {
    console.log(
      JSON.stringify({
        scope: 'ashy-unit',
        message: 'container stopped',
        data: params,
      }),
    )
  }

  override onError(error: unknown): void {
    console.error(
      JSON.stringify({
        scope: 'ashy-unit',
        message: 'container error',
        data: { error: error instanceof Error ? error.message : String(error) },
      }),
    )
    throw error
  }
}

export default {
  async fetch(request: Request, workerEnv: Env): Promise<Response> {
    const url = new URL(request.url)
    // Worker-only probe. App health stays at /healthz inside the container.
    if (url.pathname === '/cf/ready') {
      return Response.json({
        ok: true,
        runtime: 'cloudflare-containers',
        unit: ASHY_UNIT_INSTANCE_NAME,
        containerPort: ASHY_CONTAINER_PORT,
      })
    }

    const unit = getContainer(workerEnv.ASHY_UNIT, ASHY_UNIT_INSTANCE_NAME)
    return unit.fetch(request)
  },
}
