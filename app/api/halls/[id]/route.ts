import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { emitConferenceEvent } from "@/lib/socket";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "organizer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const hall = await prisma.hall.findUnique({
    where: { id: parseInt(id) },
    include: {
      sections: {
        include: {
          presenters: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
        },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      },
      votingStatus: true,
    },
  });
  if (!hall) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(hall);
}

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
    const name = body.name.trim().replace(/<[^>]*>/g, "");
    if (name.length > 256) {
      return NextResponse.json({ error: "Название не должно превышать 256 символов" }, { status: 400 });
    }
    data.name = name;
  }

  const updated = await prisma.hall.update({
    where: { id: parseInt(id) },
    data,
    select: { id: true, name: true, conferenceId: true },
  });
  emitConferenceEvent(updated.conferenceId, "hall:updated", { hallId: updated.id });
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
  const hallId = parseInt(id);
  const hall = await prisma.hall.findUnique({
    where: { id: hallId },
    select: { conferenceId: true },
  });
  try {
    await prisma.hall.delete({ where: { id: hallId } });
    if (hall) emitConferenceEvent(hall.conferenceId, "hall:deleted", { hallId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Delete hall error:", err);
    return NextResponse.json(
      { error: "Невозможно удалить зал: есть связанные данные" },
      { status: 409 }
    );
  }
}
