import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return new Response(JSON.stringify({ error: 'Forbidden in production' }), { status: 403 })
  }
  const body = await req.json().catch(() => ({})) as any
  const type = String(body.type || '')
  const userId = String(body.userId || 'demo-user')
  if (!type) return new Response(JSON.stringify({ error: 'Missing type' }), { status: 400 })
  const res = await prisma.sample.deleteMany({ where: { userId, type } })
  return new Response(JSON.stringify({ ok: true, deleted: res.count, type, userId }), { status: 200 })
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')
  const userId = searchParams.get('userId') || 'demo-user'
  if (!type) return new Response(JSON.stringify({ error: 'Missing type' }), { status: 400 })
  if (process.env.NODE_ENV !== 'development') {
    return new Response(JSON.stringify({ error: 'Forbidden in production' }), { status: 403 })
  }
  const res = await prisma.sample.deleteMany({ where: { userId, type } })
  return new Response(JSON.stringify({ ok: true, deleted: res.count, type, userId }), { status: 200 })
}

