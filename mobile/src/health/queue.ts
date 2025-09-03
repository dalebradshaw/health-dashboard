import { getJSON, setJSON } from '../storage'
import { ingestSamples, IngestSample } from '../api/client'
import { NativeModules } from 'react-native'

type QueueItem = {
  id: string
  samples: IngestSample[]
  createdAt: number
  attempts: number
  anchors?: Record<string, string>
  deletes?: { uuid: string; type: string }[]
}

const KEY = 'uploadQueueV1'

async function loadQueue(): Promise<QueueItem[]> {
  return (await getJSON<QueueItem[]>(KEY)) ?? []
}

async function saveQueue(items: QueueItem[]): Promise<void> {
  await setJSON(KEY, items)
}

export async function enqueue(samples: IngestSample[], anchors?: Record<string,string>, deletes?: { uuid: string; type: string }[]): Promise<void> {
  if (!samples.length) return
  const items = await loadQueue()
  items.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, samples, anchors, deletes, createdAt: Date.now(), attempts: 0 })
  await saveQueue(items)
}

export async function flush(params: { userId: string; deviceId: string; token: string; max?: number }): Promise<{ sent: number; remaining: number }> {
  const max = params.max ?? 5
  let items = await loadQueue()
  let sent = 0
  for (let i = 0; i < Math.min(items.length, max); i++) {
    const item = items[0]
    try {
      await ingestSamples({ userId: params.userId, deviceId: params.deviceId, token: params.token, samples: item.samples, deletes: item.deletes })
      // If upload succeeded and we have anchor tokens, commit them natively
      const Native = (NativeModules as any)?.HealthAnchorsModule
      if (item.anchors && Native?.commitAnchor) {
        for (const [t, token] of Object.entries(item.anchors)) {
          try { await Native.commitAnchor(t, token) } catch {}
        }
      }
      items.shift()
      sent += item.samples.length
      await saveQueue(items)
    } catch {
      // increment attempts and stop (retry on next flush)
      item.attempts += 1
      items[0] = item
      await saveQueue(items)
      break
    }
  }
  return { sent, remaining: (await loadQueue()).length }
}
