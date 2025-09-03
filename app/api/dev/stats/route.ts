import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

export async function GET() {
  const total = await prisma.sample.count()
  const types = await prisma.sample.groupBy({ by: ['type'], _count: { _all: true }, _min: { start: true }, _max: { end: true } })
  const out = types.map(t => ({
    type: t.type,
    count: t._count._all,
    minStart: t._min.start,
    maxEnd: t._max.end,
  }))
  return new Response(JSON.stringify({ total, types: out }, null, 2), { status: 200 })
}

