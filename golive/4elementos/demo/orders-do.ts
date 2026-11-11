import { emptySnapshot, reduceDemo, type DemoSnapshot, type DemoStore, type MutateResult, type DemoOp } from './state.ts'

interface DoStorage {
  get<T>(key: string): Promise<T | undefined>
  put<T>(key: string, value: T): Promise<void>
}

interface DoState {
  storage: DoStorage
  blockConcurrencyWhile?<T>(callback: () => Promise<T>): Promise<T>
}

/**
 * One SQLite-backed document for the demo preview.
 * The white-label branch can replace this with packages/core storage later.
 */
export class ElementosDemoOrders {
  #state: DoState

  constructor(state: DoState, _env: unknown) {
    this.#state = state
  }

  async fetch(request: Request): Promise<Response> {
    const run = () => this.#handle(request)
    if (this.#state.blockConcurrencyWhile) return this.#state.blockConcurrencyWhile(run)
    return run()
  }

  async #handle(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const current = (await this.#state.storage.get<DemoSnapshot>('book')) ?? emptySnapshot()
    if (url.pathname === '/snapshot' && request.method === 'GET') {
      return Response.json(current)
    }
    if (url.pathname === '/mutate' && request.method === 'POST') {
      let op: DemoOp
      try {
        op = (await request.json()) as DemoOp
      } catch {
        return Response.json({ error: 'invalid_json' }, { status: 400 })
      }
      const result = reduceDemo(current, op)
      await this.#state.storage.put('book', result.state)
      return Response.json(result)
    }
    return Response.json({ error: 'not_found' }, { status: 404 })
  }
}

export interface OrderNamespace {
  idFromName(name: string): unknown
  get(id: unknown): { fetch(request: Request): Promise<Response> }
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`demo_store_${response.status}`)
  return (await response.json()) as T
}

export function durableObjectStore(namespace: OrderNamespace): DemoStore {
  const stub = namespace.get(namespace.idFromName('4elementos-demo'))
  return {
    async snapshot() {
      const response = await stub.fetch(new Request('https://elementos-demo.internal/snapshot'))
      return readJson<DemoSnapshot>(response)
    },
    async mutate(op) {
      const response = await stub.fetch(
        new Request('https://elementos-demo.internal/mutate', {
          method: 'POST',
          body: JSON.stringify(op),
        }),
      )
      return readJson<MutateResult>(response)
    },
  }
}
