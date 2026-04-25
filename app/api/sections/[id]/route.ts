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
  if (typeof body.order === "number") data.order = body.order;
  // hallId can be set to a number (assign) or null (unassign)
  if ("hallId" in body) {
    data.hallId = typeof body.hallId === "number" ? body.hallId : null;
  }

  const updated = await prisma.section.update({
    where: { id: parseInt(id) },
    data,
  });
  emitConferenceEvent(updated.conferenceId, "section:updated", { sectionId: updated.id });
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
  const sectionId = parseInt(id);
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    select: { conferenceId: true },
  });
  try {
    await prisma.section.delete({ where: { id: sectionId } });
    if (section) {
      emitConferenceEvent(section.conferenceId, "section:deleted", { sectionId });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Delete section error:", err);
    return NextResponse.json(
      { error: "Невозможно удалить секцию: есть связанные данные" },
      { status: 409 }
    );
  }
}
