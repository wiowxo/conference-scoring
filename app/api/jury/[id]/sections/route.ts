import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { emitConferenceEvent } from "@/lib/socket";

// GET — list assigned section IDs
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "organizer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const assignments = await prisma.jurySectionAssignment.findMany({
    where: { juryMemberId: parseInt(id) },
    select: { sectionId: true },
  });
  return NextResponse.json(assignments.map((a) => a.sectionId));
}

// PUT — replace all section assignments atomically
// Body: { sectionIds: number[] }
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "organizer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const juryMemberId = parseInt(id);
  const { sectionIds } = await req.json();

  if (!Array.isArray(sectionIds)) {
    return NextResponse.json({ error: "sectionIds must be an array" }, { status: 400 });
  }

  const ids: number[] = sectionIds.filter((x) => typeof x === "number");

  const juryMemberRecord = await prisma.juryMember.findUnique({
    where: { id: juryMemberId },
    select: { conferenceId: true },
  });

  // Delete all existing assignments, then re-create
  await prisma.$transaction([
    prisma.jurySectionAssignment.deleteMany({ where: { juryMemberId } }),
    ...(ids.length > 0
      ? [
          prisma.jurySectionAssignment.createMany({
            data: ids.map((sectionId) => ({ juryMemberId, sectionId })),
            skipDuplicates: true,
          }),
        ]
      : []),
  ]);

  if (juryMemberRecord) {
    emitConferenceEvent(juryMemberRecord.conferenceId, "jury:sections:updated", { juryMemberId });
  }

  return NextResponse.json({ ok: true, sectionIds: ids });
}
