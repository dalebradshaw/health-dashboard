import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

// Simple daily rollup for steps (sum) and heartRate (avg)
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as any))
  const dateParam = body?.date as string | undefined
  const day = dateParam ? new Date(dateParam) : new Date(Date.now() - 24 * 60 * 60 * 1000) // default: yesterday
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate())
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)

  const types = ['steps', 'heartRate', 'activeEnergyBurned']

  const results: Record<string, any> = {}
  for (const type of types) {
    const rows = await prisma.sample.findMany({
      where: { type, start: { gte: dayStart }, end: { lte: dayEnd } },
      select: { valueDecimal: true, valueInt: true },
      take: 50000,
    })
    const nums = rows.map((r) => (r.valueDecimal ?? r.valueInt ?? 0) as number).filter((n) => Number.isFinite(n))
    let metric: any
    if (type === 'heartRate') {
      const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0
      const min = nums.length ? Math.min(...nums) : 0
      const max = nums.length ? Math.max(...nums) : 0
      metric = { avg, min, max, unit: 'count/min' }
    } else if (type === 'steps') {
      const sum = nums.reduce((a, b) => a + b, 0)
      metric = { sum, unit: 'count' }
    } else {
      const sum = nums.reduce((a, b) => a + b, 0)
      metric = { sum, unit: 'kcal' }
    }

    await prisma.dailySummary.upsert({
      where: { userId_date_type: { userId: 'demo-user', date: dayStart, type } },
      update: { metricJson: metric },
      create: { userId: 'demo-user', date: dayStart, type, metricJson: metric },
    })
    results[type] = metric
  }

  return new Response(JSON.stringify({ ok: true, date: dayStart.toISOString().slice(0, 10), results }), { status: 200 })
}

