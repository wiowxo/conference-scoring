import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { emitConferenceEvent } from "@/lib/socket";
import { sanitize } from "@/lib/sanitize";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "organizer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const sections = await prisma.section.findMany({
    where: { hallId: parseInt(id) },
    include: { presenters: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] } },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(sections);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "organizer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const hallId = parseInt(id);
  const body = await req.json();
  const name = sanitize(body.name);

  if (!name) {
    return NextResponse.json({ error: "name обязателен" }, { status: 400 });
  }
  if (name.length > 256) {
    return NextResponse.json({ error: "Название не должно превышать 256 символов" }, { status: 400 });
  }

  const hall = await prisma.hall.findUnique({
    where: { id: hallId },
    select: { conferenceId: true },
  });
  if (!hall) return NextResponse.json({ error: "Зал не найден" }, { status: 404 });
  const existingCount = await prisma.section.count({ where: { conferenceId: hall.conferenceId } });
  const section = await prisma.section.create({
    data: { hallId, conferenceId: hall.conferenceId, name, order: existingCount },
  });
  emitConferenceEvent(hall.conferenceId, "section:created", { sectionId: section.id, hallId });
  return NextResponse.json(section, { status: 201 });
}
