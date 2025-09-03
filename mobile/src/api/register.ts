import { API_BASE_URL } from '../config'

export async function registerDevice(params: { userId: string; deviceName?: string }) {
  const res = await fetch(`${API_BASE_URL}/api/devices/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Register failed: ${res.status} ${text}`)
  }
  return res.json() as Promise<{ deviceId: string; token: string; deviceName?: string }>
}

