import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { emitConferenceEvent } from "@/lib/socket";
import { sanitize } from "@/lib/sanitize";

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
  const name = sanitize(body.name);

  if (!name) {
    return NextResponse.json({ error: "name обязателен" }, { status: 400 });
  }
  if (name.length > 256) {
    return NextResponse.json({ error: "Название не должно превышать 256 символов" }, { status: 400 });
  }

  const conference = await prisma.conference.findUnique({
    where: { id: conferenceId },
    select: { id: true },
  });
  if (!conference) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const existingCount = await prisma.section.count({ where: { conferenceId } });
  const section = await prisma.section.create({
    data: {
      conferenceId,
      hallId: typeof body.hallId === "number" ? body.hallId : null,
      name,
      order: existingCount,
    },
    include: { presenters: true },
  });
  emitConferenceEvent(conferenceId, "section:created", { sectionId: section.id });
  return NextResponse.json(section, { status: 201 });
}
