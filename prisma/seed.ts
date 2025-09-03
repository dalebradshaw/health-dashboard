import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const userId = 'demo-user'
  const deviceId = 'seed-device'

  await prisma.user.upsert({ where: { id: userId }, create: { id: userId }, update: {} })
  await prisma.device.upsert({ where: { id: deviceId }, create: { id: deviceId, userId, name: 'Seed Device', secretHash: 'seed' }, update: {} })

  const now = new Date()
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000)

  const hrSamples = Array.from({ length: 18 }).map((_, i) => {
    const start = new Date(sixHoursAgo.getTime() + i * 20 * 60 * 1000)
    const end = new Date(start.getTime() + 60 * 1000)
    const value = 60 + Math.round(20 * Math.sin(i / 3) + Math.random() * 5)
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
  const steps = 6000 + Math.round(Math.random() * 3000)
  const energy = 500 + Math.round(Math.random() * 200)

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

  await prisma.$transaction([
    ...hrSamples.map((s) =>
      prisma.sample.upsert({ where: { uuid_type: { uuid: s.uuid!, type: s.type } }, update: { valueDecimal: s.valueDecimal }, create: s }),
    ),
    prisma.sample.upsert({ where: { uuid_type: { uuid: stepSample.uuid, type: stepSample.type } }, update: { valueInt: stepSample.valueInt }, create: stepSample }),
    prisma.sample.upsert({ where: { uuid_type: { uuid: energySample.uuid, type: energySample.type } }, update: { valueDecimal: energySample.valueDecimal }, create: energySample }),
  ])
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })

