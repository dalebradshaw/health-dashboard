import AppleHealthKit from 'react-native-health'
import { enqueue, flush } from './queue'
import { IngestSample } from '../api/client'

function iso(d: Date) { return d.toISOString() }
function dayStart(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x }
function dayEnd(d: Date) { const x = dayStart(d); x.setDate(x.getDate()+1); return new Date(x.getTime()-1) }

async function backfillHeartRate(start: Date, end: Date): Promise<IngestSample[]> {
  return await new Promise((resolve) => {
    AppleHealthKit.getHeartRateSamples({ startDate: iso(start), endDate: iso(end), limit: 5000 }, (err, res) => {
      if (err || !Array.isArray(res)) return resolve([])
      const out: IngestSample[] = res.map((r: any) => ({ type: 'heartRate', unit: 'count/min', start: r.startDate, end: r.endDate, value: r.value, uuid: r.id }))
      resolve(out)
    })
  })
}

async function backfillHRV(start: Date, end: Date): Promise<IngestSample[]> {
  return await new Promise((resolve) => {
    AppleHealthKit.getHeartRateVariabilitySamples({ startDate: iso(start), endDate: iso(end), limit: 5000 }, (err, res) => {
      if (err || !Array.isArray(res)) return resolve([])
      const out: IngestSample[] = res.map((r: any) => ({ type: 'hrv', unit: 'ms', start: r.startDate, end: r.endDate, value: r.value, uuid: r.id }))
      resolve(out)
    })
  })
}

async function backfillActiveEnergy(day: Date): Promise<IngestSample[]> {
  const start = dayStart(day); const end = dayEnd(day)
  return await new Promise((resolve) => {
    AppleHealthKit.getActiveEnergyBurned({ startDate: iso(start), endDate: iso(end), ascending: true, limit: 5000 }, (err, res) => {
      if (err || !Array.isArray(res)) return resolve([])
      const sum = res.reduce((a: number, r: any) => a + (Number(r.value) || 0), 0)
      resolve([{ type: 'activeEnergyBurned', unit: 'kcal', start: iso(start), end: iso(end), value: sum, uuid: `aeb-${iso(start).slice(0,10)}` }])
    })
  })
}

async function backfillSteps(day: Date): Promise<IngestSample[]> {
  const start = dayStart(day); const end = dayEnd(day)
  return await new Promise((resolve) => {
    AppleHealthKit.getStepCount({ date: iso(start) }, (err, res) => {
      if (err || !res) return resolve([])
      resolve([{ type: 'steps', unit: 'count', start: iso(start), end: iso(end), value: res.value, uuid: `steps-${iso(start).slice(0,10)}` }])
    })
  })
}

async function backfillSleep(_start: Date, _end: Date): Promise<IngestSample[]> {
  // Skip sleep backfill to avoid double-counting (stages vs totals) — rely on native anchored sync for accurate stages
  return []
}

export async function backfillDays(params: { days: number; userId: string; deviceId: string; token: string; log?: (m: string)=>void; shouldCancel?: ()=>boolean }) {
  const log = params.log ?? (()=>{})
  const today = dayStart(new Date())
  const chunk = 7 // days per chunk for HR/HRV/Sleep queries
  let processed = 0
  while (processed < params.days) {
    if (params.shouldCancel?.()) { log('Backfill canceled'); break }
    const end = new Date(today); end.setDate(end.getDate() - processed)
    const start = new Date(end); start.setDate(start.getDate() - Math.min(chunk, params.days - processed))
    // HR + HRV + Sleep in window
    const [hr, hrv, sleep] = await Promise.all([
      backfillHeartRate(start, end),
      backfillHRV(start, end),
      backfillSleep(start, end),
    ])
    const samplesWindow: IngestSample[] = [...hr, ...hrv, ...sleep]
    if (samplesWindow.length) {
      await enqueue(samplesWindow)
      const res = await flush({ userId: params.userId, deviceId: params.deviceId, token: params.token })
      log(`Backfill window ${start.toDateString()}..${end.toDateString()} sent ${res.sent}`)
    }
    // Steps/energy per day within this window
    for (let i = 0; i < Math.min(chunk, params.days - processed); i++) {
      if (params.shouldCancel?.()) { log('Backfill canceled'); break }
      const day = new Date(end); day.setDate(end.getDate() - i)
      const [st, aeb] = await Promise.all([backfillSteps(day), backfillActiveEnergy(day)])
      const daily = [...st, ...aeb]
      if (daily.length) {
        await enqueue(daily)
        const res = await flush({ userId: params.userId, deviceId: params.deviceId, token: params.token })
        log(`Backfill day ${day.toDateString()} sent ${res.sent}`)
      }
    }
    processed += Math.min(chunk, params.days - processed)
  }
}
