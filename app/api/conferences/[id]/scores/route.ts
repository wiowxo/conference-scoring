import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { emitConferenceEvent } from "@/lib/socket";
import { clientIp, securityLog } from "@/lib/security-log";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "organizer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const conferenceId = parseInt(id);

  const conference = await prisma.conference.findUnique({
    where: { id: conferenceId },
    select: { status: true },
  });
  if (!conference) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (conference.status !== "ACTIVE") {
    return NextResponse.json(
      { error: "Нельзя очистить результаты завершённой конференции" },
      { status: 403 }
    );
  }

  const { count } = await prisma.score.deleteMany({
    where: { presenter: { section: { conferenceId } } },
  });

  const ip = clientIp(req);
  securityLog("scores_cleared", { organizerId: session.id, conferenceId, count, ip });
  emitConferenceEvent(conferenceId, "scores:cleared", { conferenceId });
  return NextResponse.json({ ok: true, count });
}
