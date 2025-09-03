import { PrismaClient } from '@prisma/client'

async function main() {
  const prisma = new PrismaClient()
  try {
    const users = await prisma.user.count()
    const samples = await prisma.sample.count()
    console.log(`DB connection OK. Users=${users}, Samples=${samples}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error('DB check failed:', e)
  process.exit(1)
})

