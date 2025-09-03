import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const userId = body?.userId
  const deviceName = body?.deviceName ?? 'iPhone'

  if (!userId) {
    return new Response(JSON.stringify({ error: 'Missing userId' }), { status: 400 })
  }

  // TODO: persist to DB, ensure uniqueness
  const token = crypto.randomBytes(24).toString('hex')
  const secretHash = crypto.createHash('sha256').update(token).digest('hex')

  // Ensure user exists (or create placeholder)
  const user = await prisma.user.upsert({
    where: { id: userId },
    create: { id: userId },
    update: {},
  })

  const device = await prisma.device.create({
    data: {
      userId: user.id,
      name: deviceName,
      secretHash,
    },
    select: { id: true },
  })

  return new Response(JSON.stringify({ deviceId: device.id, token, deviceName }), { status: 200 })
}
