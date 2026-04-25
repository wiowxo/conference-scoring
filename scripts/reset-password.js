require("dotenv/config");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const bcrypt = require("bcryptjs");

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  const hash = await bcrypt.hash("admin", 12);
  await prisma.organizer.updateMany({
    data: { passwordHash: hash, mustChangePassword: true },
  });
  console.log('Password reset to "admin". Organizer must change it on next login.');
  await prisma.$disconnect();
}

main().catch(console.error);
