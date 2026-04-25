import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { emitConferenceEvent } from "@/lib/socket";
import { sanitize } from "@/lib/sanitize";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "organizer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") {
    const name = sanitize(body.name);
    if (name.length > 256) {
      return NextResponse.json({ error: "Название не должно превышать 256 символов" }, { status: 400 });
    }
    data.name = name;
  }
  if (typeof body.topic === "string") {
    const topic = sanitize(body.topic);
    if (topic.length > 256) {
      return NextResponse.json({ error: "Тема не должна превышать 256 символов" }, { status: 400 });
    }
    data.topic = topic;
  }
  if ("supervisor" in body) {
    data.supervisor =
      typeof body.supervisor === "string" && body.supervisor.trim()
        ? sanitize(body.supervisor)
        : null;
  }
  if ("position" in body) {
    data.position =
      typeof body.position === "string" && body.position.trim()
        ? sanitize(body.position)
        : null;
  }
  if (typeof body.order === "number") data.order = body.order;

  const updated = await prisma.presenter.update({
    where: { id: parseInt(id) },
    data,
    include: { section: { select: { conferenceId: true } } },
  });
  emitConferenceEvent(updated.section.conferenceId, "presenter:updated", {
    presenterId: updated.id,
    sectionId: updated.sectionId,
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "organizer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const presenterId = parseInt(id);
  const presenter = await prisma.presenter.findUnique({
    where: { id: presenterId },
    include: { section: { select: { conferenceId: true } } },
  });
  try {
    await prisma.presenter.delete({ where: { id: presenterId } });
    if (presenter) {
      emitConferenceEvent(presenter.section.conferenceId, "presenter:deleted", {
        presenterId,
        sectionId: presenter.sectionId,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Delete presenter error:", err);
    return NextResponse.json(
      { error: "Невозможно удалить докладчика: есть связанные оценки" },
      { status: 409 }
    );
  }
}
