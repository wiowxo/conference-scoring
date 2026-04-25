import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { emitConferenceEvent } from "@/lib/socket";

// POST /api/conferences/[id]/criteria/reorder
// Body: { criteriaIds: number[] } — ordered list of criterion IDs in desired display order
// Assigns order = index (0, 1, 2, …) to each criterion atomically.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "organizer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const conferenceId = parseInt(id);
  const body = await req.json();

  if (!Array.isArray(body.criteriaIds)) {
    return NextResponse.json({ error: "criteriaIds обязателен" }, { status: 400 });
  }

  const criteriaIds: number[] = body.criteriaIds;

  // Verify all criteria belong to this conference
  const existing = await prisma.criterion.findMany({
    where: { conferenceId },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((c) => c.id));
  if (!criteriaIds.every((id) => existingIds.has(id))) {
    return NextResponse.json({ error: "Некоторые критерии не принадлежат этой конференции" }, { status: 400 });
  }

  // Update each criterion's order to its index in the provided array
  await prisma.$transaction(
    criteriaIds.map((criterionId, index) =>
      prisma.criterion.update({
        where: { id: criterionId },
        data: { order: index },
      })
    )
  );

  emitConferenceEvent(conferenceId, "criterion:reordered", { conferenceId });
  return NextResponse.json({ ok: true });
}
