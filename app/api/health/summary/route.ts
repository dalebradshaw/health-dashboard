import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')
  const days = Number(searchParams.get('days') ?? '7')
  const agg = (searchParams.get('agg') ?? 'sum').toLowerCase() // 'sum' | 'avg'
  if (!type) return new Response(JSON.stringify({ error: 'Missing type' }), { status: 400 })

  const end = new Date()
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000)

  const rows = await prisma.sample.findMany({
    where: { type, start: { gte: start }, end: { lte: end } },
    orderBy: { start: 'asc' },
    select: { start: true, valueDecimal: true, valueInt: true },
    take: 20000,
  })

  const sums = new Map<string, { sum: number; count: number }>()
  for (const r of rows) {
    const d = r.start.toISOString().slice(0, 10)
    const v = r.valueDecimal != null
      ? parseFloat((r.valueDecimal as unknown as any).toString())
      : (r.valueInt ?? 0)
    const cur = sums.get(d) ?? { sum: 0, count: 0 }
    const add = Number.isFinite(v) ? v : 0
    sums.set(d, { sum: cur.sum + add, count: cur.count + 1 })
  }

  const out: Array<{ name: string; count: number }> = []
  for (let i = days - 1; i >= 0; i--) {
    const dt = new Date(end.getFullYear(), end.getMonth(), end.getDate())
    dt.setDate(dt.getDate() - i)
    const key = dt.toISOString().slice(0, 10)
    const bucket = sums.get(key)
    const value = !bucket ? 0 : agg === 'avg' && bucket.count > 0 ? bucket.sum / bucket.count : bucket.sum
    out.push({ name: key, count: value })
  }
  return new Response(JSON.stringify({ type, days, agg, series: out }), { status: 200 })
}
