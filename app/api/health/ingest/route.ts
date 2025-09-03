import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    // Basic shape check
    if (!body || !Array.isArray(body.samples)) {
      return new Response(JSON.stringify({ error: 'Invalid payload' }), { status: 400 })
    }
    const authHeader = req.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : ''
    if (!body.userId || !body.deviceId || !token) {
      return new Response(JSON.stringify({ error: 'Missing auth or identifiers' }), { status: 401 })
    }

    const device = await prisma.device.findUnique({ where: { id: body.deviceId }, select: { id: true, userId: true, secretHash: true } })
    if (!device || device.userId !== body.userId) {
      return new Response(JSON.stringify({ error: 'Device not found' }), { status: 401 })
    }
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    if (tokenHash !== device.secretHash) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401 })
    }

    const samples = body.samples as Array<{ type: string; unit?: string; start: string; end: string; value: number | string; uuid?: string; metadata?: any }>
    const deletes = (Array.isArray(body.deletes) ? body.deletes : []) as Array<{ uuid: string; type: string }>

    // Upsert samples by (uuid, type) when uuid provided, else insert
    const ops = samples.map((s) => {
      const hasUuid = !!s.uuid
      const value = typeof s.value === 'number' ? { valueDecimal: s.value } : isFinite(Number(s.value)) ? { valueDecimal: Number(s.value) } : { valueText: String(s.value) }
      const data = {
        uuid: s.uuid ?? crypto.randomUUID(),
        type: s.type,
        unit: s.unit ?? null,
        start: new Date(s.start),
        end: new Date(s.end),
        metadataJson: s.metadata ?? null,
        userId: body.userId as string,
        deviceId: body.deviceId as string,
        ...value,
      }
      if (hasUuid) {
        return prisma.sample.upsert({
          where: { uuid_type: { uuid: data.uuid, type: data.type } },
          update: { metadataJson: data.metadataJson },
          create: data,
        })
      }
      return prisma.sample.create({ data })
    })

    const deleteOps = deletes.map((d) => prisma.sample.deleteMany({ where: { uuid: d.uuid, type: d.type, userId: body.userId as string } }))
    const results = await prisma.$transaction([...ops, ...deleteOps], { timeout: 20000 })
    return new Response(JSON.stringify({ ok: true, inserted: ops.length, deleted: deleteOps.length }), { status: 200 })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? 'Unknown error' }), { status: 500 })
  }
}
