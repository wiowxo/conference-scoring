import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// Returns the full jury member record with all data needed by ScoringPanel,
// plus all scores submitted by this jury member.
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "jury") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const juryMember = await prisma.juryMember.findUnique({
    where: { id: session.id },
    include: {
      conference: {
        include: {
          criteria: {
            orderBy: [{ order: "asc" }, { name: "asc" }],
            include: {
              qualityZones: { orderBy: { order: "asc" } },
            },
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

  if (!juryMember) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const scores = await prisma.score.findMany({
    where: { juryMemberId: session.id },
  });

  return NextResponse.json({ juryMember, scores });
}
