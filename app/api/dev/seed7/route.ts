import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

export async function POST() {
  if (process.env.NODE_ENV !== 'development') {
    return new Response(JSON.stringify({ error: 'Forbidden in production' }), { status: 403 })
  }

  const userId = 'demo-user'
  const deviceId = 'seed-device'
  await prisma.user.upsert({ where: { id: userId }, create: { id: userId }, update: {} })
  await prisma.device.upsert({ where: { id: deviceId }, create: { id: deviceId, userId, name: 'Seed Device', secretHash: 'seed' }, update: {} })

  const today = new Date()
  const days = 7
  const tx: any[] = []

  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    day.setDate(day.getDate() - i)
    const endOfDay = new Date(day.getTime() + 24 * 60 * 60 * 1000 - 1)

    // Steps
    const steps = 5000 + Math.round(Math.random() * 5000)
    tx.push(
      prisma.sample.upsert({
        where: { uuid_type: { uuid: `seed-steps-${day.toISOString().slice(0,10)}`, type: 'steps' } },
        update: { valueInt: steps },
        create: {
          uuid: `seed-steps-${day.toISOString().slice(0,10)}`,
          type: 'steps',
          unit: 'count',
          start: day,
          end: endOfDay,
          valueInt: steps,
          userId,
          deviceId,
        },
      })
    )

    // Active Energy
    const energy = 400 + Math.round(Math.random() * 300)
    tx.push(
      prisma.sample.upsert({
        where: { uuid_type: { uuid: `seed-aeb-${day.toISOString().slice(0,10)}`, type: 'activeEnergyBurned' } },
        update: { valueDecimal: energy as any },
        create: {
          uuid: `seed-aeb-${day.toISOString().slice(0,10)}`,
          type: 'activeEnergyBurned',
          unit: 'kcal',
          start: day,
          end: endOfDay,
          valueDecimal: energy as any,
          userId,
          deviceId,
        },
      })
    )

    // Heart rate samples: 2 hours around noon
    const base = new Date(day.getTime() + 12 * 60 * 60 * 1000)
    for (let k = 0; k < 24; k++) {
      const start = new Date(base.getTime() + k * 5 * 60 * 1000)
      const end = new Date(start.getTime() + 60 * 1000)
      const value = 62 + Math.round(15 * Math.sin(k / 4) + Math.random() * 4)
      tx.push(
        prisma.sample.upsert({
          where: { uuid_type: { uuid: `seed-hr-${start.toISOString()}`, type: 'heartRate' } },
          update: { valueDecimal: value as any },
          create: {
            uuid: `seed-hr-${start.toISOString()}`,
            type: 'heartRate',
            unit: 'count/min',
            start,
            end,
            valueDecimal: value as any,
            userId,
            deviceId,
          },
        })
      )
    }

    // Sleep: last night attributed to previous date's start (23:00 to 07:00 next day)
    const sleepStart = new Date(day.getTime() - 1 * 60 * 60 * 1000) // 23:00 previous day relative to midnight
    sleepStart.setHours(23, 0, 0, 0)
    const sleepEnd = new Date(day.getTime() + 7 * 60 * 60 * 1000) // 07:00 current day
    const sleepMins = Math.round((sleepEnd.getTime() - sleepStart.getTime()) / 60000)
    tx.push(
      prisma.sample.upsert({
        where: { uuid_type: { uuid: `seed-sleep-${sleepStart.toISOString().slice(0,10)}`, type: 'sleep' } },
        update: { valueInt: sleepMins },
        create: {
          uuid: `seed-sleep-${sleepStart.toISOString().slice(0,10)}`,
          type: 'sleep',
          unit: 'min',
          start: sleepStart,
          end: sleepEnd,
          valueInt: sleepMins,
          userId,
          deviceId,
        },
      })
    )
  }

  const res = await prisma.$transaction(tx)
  return new Response(JSON.stringify({ ok: true, inserted: res.length }), { status: 200 })
}

// Dev convenience: allow GET in browser to trigger the same logic
export async function GET() {
  return POST()
}
