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
  const conferenceId = req.nextUrl.searchParams.get("conferenceId");
  const criteria = await prisma.criterion.findMany({
    where: conferenceId ? { conferenceId: parseInt(conferenceId) } : undefined,
    orderBy: [{ order: "asc" }, { name: "asc" }],
  });
  return NextResponse.json(criteria);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "organizer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const name = sanitize(body.name);
  const conferenceId = typeof body.conferenceId === "number" ? body.conferenceId : parseInt(body.conferenceId);
  const minScore = typeof body.minScore === "number" ? body.minScore : parseFloat(body.minScore);
  const maxScore = typeof body.maxScore === "number" ? body.maxScore : parseFloat(body.maxScore);

  if (!conferenceId || !name || isNaN(minScore) || isNaN(maxScore)) {
    return NextResponse.json(
      { error: "conferenceId, name, minScore и maxScore обязательны" },
      { status: 400 }
    );
  }
  if (name.length > 256) {
    return NextResponse.json({ error: "Название не должно превышать 256 символов" }, { status: 400 });
  }

  if (minScore < 0) {
    return NextResponse.json(
      { error: "Минимальная оценка не может быть отрицательной" },
      { status: 400 }
    );
  }

  if (maxScore <= minScore) {
    return NextResponse.json(
      { error: "Максимальная оценка должна быть больше минимальной" },
      { status: 400 }
    );
  }

  const existingCount = await prisma.criterion.count({ where: { conferenceId } });
  const criterion = await prisma.criterion.create({
    data: { conferenceId, name, minScore, maxScore, order: existingCount },
  });
  emitConferenceEvent(conferenceId, "criterion:created", { criterionId: criterion.id });
  return NextResponse.json(criterion, { status: 201 });
}
