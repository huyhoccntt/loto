type BroadcastMessage = { event: string; payload: unknown }
type Listener = (message: { payload: unknown }) => void

export class LocalRealtimeChannel {
  private readonly channel: BroadcastChannel
  private readonly listeners = new Map<string, Listener[]>()

  constructor(name: string) {
    this.channel = new BroadcastChannel(name)
    this.channel.addEventListener('message', (message: MessageEvent<BroadcastMessage>) => {
      const callbacks = this.listeners.get(message.data.event) ?? []
      callbacks.forEach((callback) => callback({ payload: message.data.payload }))
    })
  }

  on(_type: 'broadcast', filter: { event: string }, callback: Listener) {
    const callbacks = this.listeners.get(filter.event) ?? []
    callbacks.push(callback)
    this.listeners.set(filter.event, callbacks)
    return this
  }

  subscribe(callback: (status: 'SUBSCRIBED') => void) {
    queueMicrotask(() => callback('SUBSCRIBED'))
    return this
  }

  async send(message: { type: 'broadcast'; event: string; payload: unknown }): Promise<'ok' | 'error'> {
    try {
      this.channel.postMessage({ event: message.event, payload: message.payload } satisfies BroadcastMessage)
      return 'ok'
    } catch {
      return 'error'
    }
  }

  async track(_state: { playerId: string }): Promise<'ok'> {
    return 'ok'
  }

  async unsubscribe() {
    this.channel.close()
    this.listeners.clear()
    return 'ok'
  }
}
