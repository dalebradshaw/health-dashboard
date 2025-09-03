import { getJSON, setJSON } from './storage'

const KEY = 'deviceCreds'

export type DeviceCreds = { deviceId: string; token: string }

export async function loadDevice(): Promise<DeviceCreds | null> {
  return getJSON<DeviceCreds>(KEY)
}

export async function saveDevice(creds: DeviceCreds): Promise<void> {
  await setJSON(KEY, creds)
}

