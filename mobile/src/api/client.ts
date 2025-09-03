import { API_BASE_URL } from '../config'

export type IngestSample = {
  type: string
  unit?: string
  start: string
  end: string
  value: number | string
  uuid?: string
  metadata?: Record<string, any>
}

export async function ingestSamples(params: {
  userId: string
  deviceId: string
  token?: string
  samples: IngestSample[]
  deletes?: { uuid: string; type: string }[]
}) {
  const res = await fetch(`${API_BASE_URL}/api/health/ingest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: params.token ? `Bearer ${params.token}` : '',
    },
    body: JSON.stringify({ userId: params.userId, deviceId: params.deviceId, samples: params.samples, deletes: params.deletes ?? [] }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Ingest failed: ${res.status} ${text}`)
  }
  return res.json()
}
