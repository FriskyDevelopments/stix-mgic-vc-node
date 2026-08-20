type ObsEvent = { eventType: string; eventData?: Record<string, unknown> }

export type ObsState = {
  connected: boolean
  streaming: boolean
  recording: boolean
  virtualCamera: boolean
  inputMuted: boolean
  scene: string
  scenes: string[]
}

const INITIAL_STATE: ObsState = {
  connected: false,
  streaming: false,
  recording: false,
  virtualCamera: false,
  inputMuted: false,
  scene: '',
  scenes: [],
}

async function sha256Base64(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
}

export class ObsWebSocketClient {
  private socket: WebSocket | null = null
  private requestId = 0
  private pending = new Map<string, { resolve: (value: any) => void; reject: (error: Error) => void }>()
  private state: ObsState = { ...INITIAL_STATE }

  constructor(private onState: (state: ObsState) => void) {}

  async connect(url: string, password = ''): Promise<void> {
    this.disconnect()
    const socket = new WebSocket(url)
    this.socket = socket
    socket.onmessage = (event) => void this.handleMessage(JSON.parse(String(event.data)), password)
    socket.onclose = () => this.publish({ ...INITIAL_STATE })
    socket.onerror = () => this.rejectAll(new Error('Could not connect to OBS WebSocket'))
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('OBS connection timed out')), 6000)
      socket.addEventListener('open', () => { window.clearTimeout(timeout); resolve() }, { once: true })
      socket.addEventListener('error', () => { window.clearTimeout(timeout); reject(new Error('Could not connect to OBS WebSocket')) }, { once: true })
    })
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('OBS authentication timed out')), 6000)
      const check = (event: MessageEvent) => {
        const message = JSON.parse(String(event.data))
        if (message.op === 2) {
          window.clearTimeout(timeout)
          socket.removeEventListener('message', check)
          resolve()
        }
      }
      socket.addEventListener('message', check)
    })
    await this.refresh()
  }

  disconnect(): void {
    this.socket?.close()
    this.socket = null
    this.rejectAll(new Error('OBS disconnected'))
    this.publish({ ...INITIAL_STATE })
  }

  async refresh(): Promise<void> {
    const [scenes, stream, record, camera] = await Promise.all([
      this.request('GetSceneList'), this.request('GetStreamStatus'), this.request('GetRecordStatus'), this.request('GetVirtualCamStatus'),
    ])
    this.publish({
      ...this.state,
      connected: true,
      scene: scenes.currentProgramSceneName || '',
      scenes: (scenes.scenes || []).map((scene: any) => scene.sceneName),
      streaming: Boolean(stream.outputActive),
      recording: Boolean(record.outputActive),
      virtualCamera: Boolean(camera.outputActive),
    })
  }

  async setScene(sceneName: string): Promise<void> { await this.request('SetCurrentProgramScene', { sceneName }); await this.refresh() }
  async toggleStream(): Promise<void> { await this.request('ToggleStream'); await this.refresh() }
  async toggleRecord(): Promise<void> { await this.request('ToggleRecord'); await this.refresh() }
  async toggleVirtualCamera(): Promise<void> { await this.request('ToggleVirtualCam'); await this.refresh() }
  async toggleMute(inputName: string): Promise<void> {
    const result = await this.request('ToggleInputMute', { inputName })
    this.publish({ ...this.state, inputMuted: Boolean(result.inputMuted) })
  }

  private async handleMessage(message: any, password: string): Promise<void> {
    if (message.op === 0) {
      const auth = message.d?.authentication
      let authentication: string | undefined
      if (auth) {
        if (!password) { this.socket?.close(); this.rejectAll(new Error('OBS requires its WebSocket password')); return }
        const secret = await sha256Base64(password + auth.salt)
        authentication = await sha256Base64(secret + auth.challenge)
      }
      this.socket?.send(JSON.stringify({ op: 1, d: { rpcVersion: 1, authentication, eventSubscriptions: 1 } }))
      return
    }
    if (message.op === 7) {
      const requestId = message.d?.requestId
      const pending = this.pending.get(requestId)
      if (!pending) return
      this.pending.delete(requestId)
      if (message.d?.requestStatus?.result) pending.resolve(message.d.responseData || {})
      else pending.reject(new Error(message.d?.requestStatus?.comment || 'OBS request failed'))
      return
    }
    if (message.op === 5) this.handleEvent(message.d as ObsEvent)
  }

  private handleEvent(event: ObsEvent): void {
    if (event.eventType === 'CurrentProgramSceneChanged') this.publish({ ...this.state, scene: String(event.eventData?.sceneName || '') })
    if (event.eventType === 'StreamStateChanged') this.publish({ ...this.state, streaming: Boolean(event.eventData?.outputActive) })
    if (event.eventType === 'RecordStateChanged') this.publish({ ...this.state, recording: Boolean(event.eventData?.outputActive) })
    if (event.eventType === 'VirtualcamStateChanged') this.publish({ ...this.state, virtualCamera: Boolean(event.eventData?.outputActive) })
  }

  private request(requestType: string, requestData?: Record<string, unknown>): Promise<any> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error('OBS is not connected'))
    const requestId = `vc-${++this.requestId}`
    this.socket.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }))
    return new Promise((resolve, reject) => this.pending.set(requestId, { resolve, reject }))
  }

  private publish(state: ObsState): void { this.state = state; this.onState({ ...state }) }
  private rejectAll(error: Error): void { this.pending.forEach(({ reject }) => reject(error)); this.pending.clear() }
}
