import type { StripeEvent } from '../payments/stripe.ts'

export type OrderStatus = 'pending' | 'paid' | 'canceled' | 'expired' | 'failed'

export interface Order {
  id: string
  tenant: '4elementos'
  serviceId: string
  serviceName: string
  amountMxn: number
  currency: 'mxn'
  email?: string
  status: OrderStatus
  checkoutSessionId?: string
  demo: true
  createdAt: string
  updatedAt: string
}

export interface InboundMessage {
  id: string
  at: string
  from: string
  text: string
  provider: 'WAHA'
}

export interface CallRecord {
  id: string
  at: string
  to: string
  from: string
  reason: string
  via: 'marina' | 'twilio'
  status: string
  providerSid?: string
}

export interface DemoSnapshot {
  orders: Order[]
  seenEventIds: string[]
  messages: InboundMessage[]
  calls: CallRecord[]
}

export type DemoOp =
  | { type: 'create_order'; order: Order }
  | { type: 'set_status'; orderId: string; status: Exclude<OrderStatus, 'paid'>; sessionId?: string; at: string }
  | { type: 'stripe_event'; event: StripeEvent; at: string }
  | { type: 'inbound_message'; message: InboundMessage }
  | { type: 'call_record'; call: CallRecord }
  | { type: 'call_status'; providerSid: string; status: string; at: string }

export interface MutateResult {
  state: DemoSnapshot
  duplicate: boolean
  order: Order | null
}

export function emptySnapshot(): DemoSnapshot {
  return { orders: [], seenEventIds: [], messages: [], calls: [] }
}

export function reduceDemo(current: DemoSnapshot, op: DemoOp): MutateResult {
  const state: DemoSnapshot = {
    orders: current.orders.map((order) => ({ ...order })),
    seenEventIds: [...current.seenEventIds],
    messages: current.messages.map((message) => ({ ...message })),
    calls: current.calls.map((call) => ({ ...call })),
  }

  if (op.type === 'create_order') {
    if (state.orders.some((order) => order.id === op.order.id)) {
      return { state, duplicate: true, order: state.orders.find((order) => order.id === op.order.id) ?? null }
    }
    state.orders.unshift(op.order)
    return { state, duplicate: false, order: op.order }
  }

  if (op.type === 'set_status') {
    const order = state.orders.find((item) => item.id === op.orderId) ?? null
    if (!order || order.status !== 'pending') return { state, duplicate: false, order }
    if (op.sessionId) order.checkoutSessionId = op.sessionId
    if (op.status !== 'pending') order.status = op.status
    order.updatedAt = op.at
    return { state, duplicate: false, order }
  }

  if (op.type === 'stripe_event') {
    if (state.seenEventIds.includes(op.event.id)) {
      const existing = orderForEvent(state, op.event)
      return { state, duplicate: true, order: existing }
    }
    state.seenEventIds.push(op.event.id)
    if (state.seenEventIds.length > 400) {
      state.seenEventIds.splice(0, state.seenEventIds.length - 400)
    }
    const order = orderForEvent(state, op.event)
    if (!order) return { state, duplicate: false, order: null }
    const type = op.event.type
    const paymentStatus = String(op.event.data.object.payment_status ?? '')
    if (type === 'checkout.session.completed' && (paymentStatus === 'paid' || paymentStatus === 'no_payment_required')) {
      order.status = 'paid'
      order.updatedAt = op.at
      const sessionId = String(op.event.data.object.id ?? '')
      if (sessionId) order.checkoutSessionId = sessionId
    } else if (type === 'checkout.session.expired' && order.status === 'pending') {
      order.status = 'expired'
      order.updatedAt = op.at
    } else if (
      (type === 'checkout.session.async_payment_failed' || type === 'checkout.session.async_payment_succeeded') &&
      order.status === 'pending'
    ) {
      order.status = type.endsWith('succeeded') ? 'paid' : 'failed'
      order.updatedAt = op.at
    } else if (type === 'payment_intent.payment_failed' && order.status === 'pending') {
      order.status = 'failed'
      order.updatedAt = op.at
    }
    return { state, duplicate: false, order }
  }

  if (op.type === 'inbound_message') {
    if (state.messages.some((message) => message.id === op.message.id)) {
      return { state, duplicate: true, order: null }
    }
    state.messages.unshift(op.message)
    if (state.messages.length > 100) state.messages.length = 100
    return { state, duplicate: false, order: null }
  }

  if (op.type === 'call_record') {
    state.calls.unshift(op.call)
    if (state.calls.length > 50) state.calls.length = 50
    return { state, duplicate: false, order: null }
  }

  const call = state.calls.find((item) => item.providerSid && item.providerSid === op.providerSid)
  if (call) call.status = op.status
  return { state, duplicate: false, order: null }
}

function orderForEvent(state: DemoSnapshot, event: StripeEvent): Order | null {
  const object = event.data.object
  const metadata = (object.metadata ?? {}) as Record<string, unknown>
  const orderId = String(metadata.order_id ?? object.client_reference_id ?? '')
  const sessionId = String(object.id ?? '')
  return (
    state.orders.find((order) => order.id === orderId) ??
    state.orders.find((order) => sessionId && order.checkoutSessionId === sessionId) ??
    null
  )
}

export interface DemoStore {
  snapshot(): Promise<DemoSnapshot>
  mutate(op: DemoOp): Promise<MutateResult>
}

export function memoryStore(initial?: DemoSnapshot): DemoStore {
  let state = initial ?? emptySnapshot()
  return {
    async snapshot() {
      return clone(state)
    },
    async mutate(op) {
      const result = reduceDemo(state, op)
      state = result.state
      return { ...result, state: clone(result.state), order: result.order ? { ...result.order } : null }
    },
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function findOrder(state: DemoSnapshot, id: string): Order | null {
  return state.orders.find((order) => order.id === id) ?? null
}

export function findOrderBySession(state: DemoSnapshot, sessionId: string): Order | null {
  return state.orders.find((order) => order.checkoutSessionId === sessionId) ?? null
}
