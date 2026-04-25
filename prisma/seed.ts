import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding database…");

  // Organizer
  const adminHash = await bcrypt.hash("admin", 10);
  await prisma.organizer.upsert({
    where: { login: "admin" },
    update: { passwordHash: adminHash, mustChangePassword: true },
    create: { login: "admin", passwordHash: adminHash },
  });
  console.log("  Organizer: login=admin  password=admin");

  // Conference
  const conference = await prisma.conference.upsert({
    where: { id: 1 },
    update: {},
    create: { name: "Demo Conference 2025", date: new Date("2025-06-15"), status: "ACTIVE" },
  });

  // Criteria
  await Promise.all([
    prisma.criterion.upsert({ where: { id: 1 }, update: {}, create: { conferenceId: conference.id, name: "Content Quality", minScore: 1, maxScore: 10 } }),
    prisma.criterion.upsert({ where: { id: 2 }, update: {}, create: { conferenceId: conference.id, name: "Presentation Style", minScore: 1, maxScore: 10 } }),
    prisma.criterion.upsert({ where: { id: 3 }, update: {}, create: { conferenceId: conference.id, name: "Q&A Performance", minScore: 1, maxScore: 10 } }),
  ]);

  // Hall
  const hall = await prisma.hall.upsert({
    where: { id: 1 },
    update: {},
    create: { conferenceId: conference.id, name: "Hall 1" },
  });

  // Section inside hall
  const sectionA = await prisma.section.upsert({
    where: { id: 1 },
    update: {},
    create: { hallId: hall.id, conferenceId: conference.id, name: "Section A — AI & ML", order: 0 },
  });

  // Presenters
  await Promise.all([
    prisma.presenter.upsert({ where: { id: 1 }, update: {}, create: { sectionId: sectionA.id, name: "Alice Smith", topic: "Deep Learning in Production", order: 1 } }),
    prisma.presenter.upsert({ where: { id: 2 }, update: {}, create: { sectionId: sectionA.id, name: "Bob Johnson", topic: "LLMs for Enterprise", order: 2 } }),
    prisma.presenter.upsert({ where: { id: 3 }, update: {}, create: { sectionId: sectionA.id, name: "Carol White", topic: "Responsible AI", order: 3 } }),
  ]);

  // Jury members — now at conference level
  const juryHash = await bcrypt.hash("jury123", 10);
  const jury1 = await prisma.juryMember.upsert({
    where: { login: "jury1" },
    update: {},
    create: { conferenceId: conference.id, name: "Jury Member 1", login: "jury1", passwordHash: juryHash },
  });
  const jury2 = await prisma.juryMember.upsert({
    where: { login: "jury2" },
    update: {},
    create: { conferenceId: conference.id, name: "Jury Member 2", login: "jury2", passwordHash: juryHash },
  });

  // Assign both jury members to Section A
  await prisma.jurySectionAssignment.upsert({
    where: { juryMemberId_sectionId: { juryMemberId: jury1.id, sectionId: sectionA.id } },
    update: {},
    create: { juryMemberId: jury1.id, sectionId: sectionA.id },
  });
  await prisma.jurySectionAssignment.upsert({
    where: { juryMemberId_sectionId: { juryMemberId: jury2.id, sectionId: sectionA.id } },
    update: {},
    create: { juryMemberId: jury2.id, sectionId: sectionA.id },
  });

  // Open voting
  await prisma.votingStatus.upsert({
    where: { hallId: hall.id },
    update: { isOpen: true },
    create: { hallId: hall.id, isOpen: true },
  });

  console.log("Seed complete.");
  console.log("  Organizer: login=admin   password=admin");
  console.log("  Jury 1:    login=jury1   password=jury123  (assigned to Section A)");
  console.log("  Jury 2:    login=jury2   password=jury123  (assigned to Section A)");
}

main().catch(console.error).finally(() => prisma.$disconnect());
