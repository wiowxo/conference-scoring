import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ScoringPanel from "@/components/ScoringPanel";

export default async function JuryDashboard() {
  const session = await getSession();
  if (!session || session.role !== "jury") redirect("/login");

  const juryMember = await prisma.juryMember.findUnique({
    where: { id: session.id },
    include: {
      conference: {
        include: {
          criteria: {
              orderBy: [{ order: "asc" }, { name: "asc" }],
              include: { qualityZones: { orderBy: { order: "asc" } } },
            },
        },
      },
      sectionAssignments: {
        include: {
          section: {
            include: {
              presenters: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
              hall: {
                include: { votingStatus: true },
              },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!juryMember) redirect("/login");

  const scores = await prisma.score.findMany({
    where: { juryMemberId: session.id },
  });

  return (
    <ScoringPanel
      juryMemberId={session.id}
      juryMember={juryMember}
      existingScores={scores}
    />
  );
}
