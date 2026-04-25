import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { emitConferenceEvent } from "@/lib/socket";

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
  if (typeof body.minScore === "number") data.minScore = body.minScore;
  if (typeof body.maxScore === "number") data.maxScore = body.maxScore;
  if (typeof body.order === "number") data.order = body.order;

  const updated = await prisma.criterion.update({
    where: { id: parseInt(id) },
    data,
  });
  emitConferenceEvent(updated.conferenceId, "criterion:updated", { criterionId: updated.id });
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
  const criterionId = parseInt(id);
  const criterion = await prisma.criterion.findUnique({
    where: { id: criterionId },
    select: { conferenceId: true },
  });
  try {
    await prisma.criterion.delete({ where: { id: criterionId } });
    if (criterion) {
      emitConferenceEvent(criterion.conferenceId, "criterion:deleted", { criterionId });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Delete criterion error:", err);
    return NextResponse.json(
      { error: "Невозможно удалить: есть связанные оценки" },
      { status: 409 }
    );
  }
}
