import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const interval = searchParams.get('interval') ?? 'day'

  if (!type) {
    return new Response(JSON.stringify({ error: 'Missing type' }), { status: 400 })
  }

  // Basic query by time range
  const where: any = { type }
  if (from) where.start = { gte: new Date(from) }
  if (to) where.end = { lte: new Date(to) }

  const rows = await prisma.sample.findMany({
    where,
    orderBy: { start: 'asc' },
    take: 2000,
    select: { start: true, end: true, valueDecimal: true, valueInt: true, valueText: true, unit: true },
  })
  const datapoints = rows.map((r) => {
    const numeric = r.valueDecimal != null
      ? parseFloat((r.valueDecimal as unknown as any).toString())
      : (r.valueInt != null ? r.valueInt : undefined)
    return {
      t0: r.start,
      t1: r.end,
      value: numeric ?? r.valueText ?? null,
      unit: r.unit,
    }
  })
  return new Response(JSON.stringify({ type, from, to, interval, datapoints }), { status: 200 })
}
