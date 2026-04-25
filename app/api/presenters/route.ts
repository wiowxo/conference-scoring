import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { emitConferenceEvent } from "@/lib/socket";
import { sanitize } from "@/lib/sanitize";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "organizer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const sectionId = req.nextUrl.searchParams.get("sectionId");
  const presenters = await prisma.presenter.findMany({
    where: sectionId ? { sectionId: parseInt(sectionId) } : undefined,
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(presenters);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "organizer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const name = sanitize(body.name);
  const topic = sanitize(body.topic);
  const supervisor = typeof body.supervisor === "string" ? sanitize(body.supervisor) || null : null;
  const position = typeof body.position === "string" ? sanitize(body.position) || null : null;
  const sectionId = typeof body.sectionId === "number" ? body.sectionId : parseInt(body.sectionId);
  const order = typeof body.order === "number" ? body.order : parseInt(body.order);

  if (!sectionId || !name || !topic || isNaN(order)) {
    return NextResponse.json({ error: "sectionId, name, topic и order обязательны" }, { status: 400 });
  }
  if (name.length > 256) {
    return NextResponse.json({ error: "Название не должно превышать 256 символов" }, { status: 400 });
  }
  if (topic.length > 256) {
    return NextResponse.json({ error: "Тема не должна превышать 256 символов" }, { status: 400 });
  }

  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    select: { conferenceId: true },
  });
  const presenter = await prisma.presenter.create({
    data: { sectionId, name, topic, supervisor, position, order },
  });
  if (section) {
    emitConferenceEvent(section.conferenceId, "presenter:created", {
      presenterId: presenter.id,
      sectionId,
    });
  }
  return NextResponse.json(presenter, { status: 201 });
}
