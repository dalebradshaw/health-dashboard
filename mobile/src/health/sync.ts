import AppleHealthKit from 'react-native-health'
import { NativeModules } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { ingestSamples, IngestSample } from '../api/client'

const A_HR = 'anchor:heartRate'
const A_HRV = 'anchor:hrv'

function iso(d: Date) { return d.toISOString() }

async function getAnchor(key: string) {
  try { return await AsyncStorage.getItem(key) } catch { return null }
}

async function setAnchor(key: string, value: string) {
  try { await AsyncStorage.setItem(key, value) } catch {}
}

export type DeleteRef = { uuid: string; type: string }

export async function collectAnchoredSamples(): Promise<{ samples: IngestSample[], anchors?: Record<string,string>, deletes?: DeleteRef[] }> {
  const now = new Date()
  const startOfDay = new Date(now); startOfDay.setHours(0,0,0,0)

  const samples: IngestSample[] = []
  let anchors: Record<string,string> | undefined
  let deletes: DeleteRef[] | undefined

  // Prefer native anchored sync for HR/HRV if available
  const Native = (NativeModules as any)?.HealthAnchorsModule
  let nativeUsed = false
  if (Native && typeof Native.sync === 'function') {
    try {
      const result = await Native.sync(['heartRate','hrv','steps','activeEnergyBurned','sleep'])
      const list: any[] = result?.samples || []
      anchors = result?.anchors || undefined
      const dels: any[] = result?.deletes || []
      if (dels?.length) {
        deletes = dels.map(d => ({ uuid: String(d.uuid), type: String(d.type) }))
      }
      for (const r of list) {
        samples.push({ type: r.type, unit: r.unit, start: r.start, end: r.end, value: r.value, uuid: r.uuid })
      }
      nativeUsed = true
    } catch (e) {
      // fall back silently
    }
  }

  // Heart Rate deltas via time anchor (fallback if native not available)
  try {
    const a = await getAnchor(A_HR)
    const startHR = a ? new Date(a) : new Date(now.getTime() - 24 * 60 * 60 * 1000)
    await new Promise<void>((resolve) => {
      AppleHealthKit.getHeartRateSamples({ startDate: iso(startHR), endDate: iso(now), limit: 2000 }, (err, res) => {
        if (!err && Array.isArray(res)) {
          res.forEach((r: any) => samples.push({ type: 'heartRate', unit: 'count/min', start: r.startDate, end: r.endDate, value: r.value, uuid: r.id }))
          if (res.length) setAnchor(A_HR, res[res.length - 1].endDate)
        }
        resolve()
      })
    })
  } catch {}

  // HRV deltas via time anchor (fallback)
  try {
    const a = await getAnchor(A_HRV)
    const startHRV = a ? new Date(a) : new Date(now.getTime() - 24 * 60 * 60 * 1000)
    await new Promise<void>((resolve) => {
      AppleHealthKit.getHeartRateVariabilitySamples({ startDate: iso(startHRV), endDate: iso(now), limit: 2000 }, (err, res) => {
        if (!err && Array.isArray(res)) {
          res.forEach((r: any) => samples.push({ type: 'hrv', unit: 'ms', start: r.startDate, end: r.endDate, value: r.value, uuid: r.id }))
          if (res.length) setAnchor(A_HRV, res[res.length - 1].endDate)
        }
        resolve()
      })
    })
  } catch {}

  // Steps (today total) idempotent by UUID per day
  if (!nativeUsed) try {
    await new Promise<void>((resolve) => {
      AppleHealthKit.getStepCount({ date: iso(startOfDay) }, (err, res) => {
        if (!err && res) {
          samples.push({ type: 'steps', unit: 'count', start: iso(startOfDay), end: iso(now), value: res.value, uuid: `steps-${iso(startOfDay).slice(0,10)}` })
        }
        resolve()
      })
    })
  } catch {}

  // Active energy (today sum) idempotent by UUID per day
  if (!nativeUsed) try {
    await new Promise<void>((resolve) => {
      AppleHealthKit.getActiveEnergyBurned({ startDate: iso(startOfDay), endDate: iso(now), ascending: true, limit: 2000 }, (err, res) => {
        if (!err && Array.isArray(res)) {
          const sum = res.reduce((a: number, r: any) => a + (Number(r.value) || 0), 0)
          samples.push({ type: 'activeEnergyBurned', unit: 'kcal', start: iso(startOfDay), end: iso(now), value: sum, uuid: `aeb-${iso(startOfDay).slice(0,10)}` })
        }
        resolve()
      })
    })
  } catch {}

  return { samples, anchors, deletes }
}

export async function syncAll(params: { userId: string; deviceId: string; token: string }) {
  const { samples, anchors, deletes } = await collectAnchoredSamples()
  if (!samples.length) return { uploaded: 0 }
  const res = await ingestSamples({ userId: params.userId, deviceId: params.deviceId, token: params.token, samples, deletes })
  // Commit anchors on success
  const Native = (NativeModules as any)?.HealthAnchorsModule
  if (anchors && Native?.commitAnchor) {
    for (const [t, token] of Object.entries(anchors)) { try { await Native.commitAnchor(t, token) } catch {} }
  }
  return { uploaded: res?.inserted ?? samples.length }
}
