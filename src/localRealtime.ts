import type { RealtimeChannel as SupabaseChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'

type BroadcastMessage = { event: string; payload: unknown }
type Listener = (message: { payload: unknown }) => void

export class LocalRealtimeChannel {
  private readonly channel: BroadcastChannel | null
  private readonly remoteChannel: SupabaseChannel | null
  private readonly listeners = new Map<string, Listener[]>()

  constructor(name: string) {
    this.remoteChannel = supabase?.channel(name) ?? null
    this.channel = this.remoteChannel || typeof BroadcastChannel === 'undefined'
      ? null
      : new BroadcastChannel(name)
    this.channel?.addEventListener('message', (message: MessageEvent<BroadcastMessage>) => {
      const callbacks = this.listeners.get(message.data.event) ?? []
      callbacks.forEach((callback) => callback({ payload: message.data.payload }))
    })
  }

  on(_type: 'broadcast', filter: { event: string }, callback: Listener) {
    if (this.remoteChannel) {
      this.remoteChannel.on('broadcast', { event: filter.event }, ({ payload }) => callback({ payload }))
    } else {
      const callbacks = this.listeners.get(filter.event) ?? []
      callbacks.push(callback)
      this.listeners.set(filter.event, callbacks)
    }
    return this
  }

  subscribe(callback: (status: string) => void) {
    if (this.remoteChannel) {
      this.remoteChannel.subscribe(callback)
    } else if (this.channel) {
      queueMicrotask(() => callback('SUBSCRIBED'))
    } else {
      queueMicrotask(() => callback('CHANNEL_ERROR'))
    }
    return this
  }

  async send(message: { type: 'broadcast'; event: string; payload: unknown }): Promise<'ok' | 'error'> {
    if (this.remoteChannel) {
      const status = await this.remoteChannel.send(message)
      return status === 'ok' ? 'ok' : 'error'
    }
    if (!this.channel) return 'error'
    try {
      this.channel.postMessage({ event: message.event, payload: message.payload } satisfies BroadcastMessage)
      return 'ok'
    } catch {
      return 'error'
    }
  }

  async track(state: { playerId: string }): Promise<'ok' | 'error'> {
    if (this.remoteChannel) {
      const status = await this.remoteChannel.track(state)
      return status === 'ok' ? 'ok' : 'error'
    }
    return this.channel ? 'ok' : 'error'
  }

  async unsubscribe(): Promise<'ok'> {
    if (this.remoteChannel) await this.remoteChannel.unsubscribe()
    this.channel?.close()
    this.listeners.clear()
    return 'ok'
  }
}
