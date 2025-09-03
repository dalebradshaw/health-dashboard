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

  const now = new Date()
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000)

  const hrSamples = Array.from({ length: 36 }).map((_, i) => {
    const start = new Date(sixHoursAgo.getTime() + i * 10 * 60 * 1000)
    const end = new Date(start.getTime() + 60 * 1000)
    const value = 60 + Math.round(20 * Math.sin(i / 2) + Math.random() * 5)
    return {
      uuid: `seed-hr-${start.toISOString()}`,
      type: 'heartRate',
      unit: 'count/min',
      start,
      end,
      valueDecimal: value as any,
      userId,
      deviceId,
    }
  })

  const dayStart = new Date(now)
  dayStart.setHours(0, 0, 0, 0)
  const steps = 5000 + Math.round(Math.random() * 4000)
  const energy = 450 + Math.round(Math.random() * 250)

  const stepSample = {
    uuid: `seed-steps-${dayStart.toISOString().slice(0, 10)}`,
    type: 'steps',
    unit: 'count',
    start: dayStart,
    end: now,
    valueInt: steps,
    userId,
    deviceId,
  } as any

  const energySample = {
    uuid: `seed-aeb-${dayStart.toISOString().slice(0, 10)}`,
    type: 'activeEnergyBurned',
    unit: 'kcal',
    start: dayStart,
    end: now,
    valueDecimal: energy as any,
    userId,
    deviceId,
  } as any

  // Upsert by uuid+type
  const tx = [
    ...hrSamples.map((s) =>
      prisma.sample.upsert({
        where: { uuid_type: { uuid: s.uuid!, type: s.type } },
        update: { valueDecimal: s.valueDecimal },
        create: s,
      }),
    ),
    prisma.sample.upsert({
      where: { uuid_type: { uuid: stepSample.uuid, type: stepSample.type } },
      update: { valueInt: stepSample.valueInt },
      create: stepSample,
    }),
    prisma.sample.upsert({
      where: { uuid_type: { uuid: energySample.uuid, type: energySample.type } },
      update: { valueDecimal: energySample.valueDecimal },
      create: energySample,
    }),
  ]

  const res = await prisma.$transaction(tx)
  return new Response(
    JSON.stringify({ ok: true, inserted: res.length, userId, deviceId }),
    { status: 200 },
  )
}

// Dev convenience: allow GET in browser to trigger the same logic
export async function GET() {
  return POST()
}
