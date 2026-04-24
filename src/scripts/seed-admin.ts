import bcrypt from 'bcrypt'
import prisma from '../config/database.js'

async function main() {
  const email = 'admin@freshroute.com'
  const password = 'Admin@1234'          // change this
  const passwordHash = await bcrypt.hash(password, 10)

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    console.log('Admin already exists:', existing.email)
    return
  }

  const admin = await prisma.user.create({
    data: {
      name: 'Super Admin',
      email,
      passwordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
    },
  })

  console.log('Admin created:', admin.email)
}

main().catch(console.error).finally(() => prisma.$disconnect())