import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { emitScoreUpdate } from "@/lib/socket";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const presenterId = req.nextUrl.searchParams.get("presenterId");
  const sectionId = req.nextUrl.searchParams.get("sectionId");

  const scores = await prisma.score.findMany({
    where: {
      ...(presenterId ? { presenterId: parseInt(presenterId) } : {}),
      ...(sectionId ? { presenter: { sectionId: parseInt(sectionId) } } : {}),
      ...(session.role === "jury" ? { juryMemberId: session.id } : {}),
    },
    include: {
      criterion: true,
      juryMember: { select: { id: true, name: true } },
      presenter: true,
    },
  });
  return NextResponse.json(scores);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "jury") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { presenterId, criterionId, value } = await req.json();
  if (!presenterId || !criterionId) {
    return NextResponse.json(
      { error: "presenterId и criterionId обязательны" },
      { status: 400 }
    );
  }

  // Validate integer
  if (value !== null && value !== undefined && !Number.isInteger(value)) {
    return NextResponse.json(
      { error: "Оценка должна быть целым числом" },
      { status: 400 }
    );
  }

  // Load presenter with section (for conferenceId) and optional hall (voting status)
  const presenter = await prisma.presenter.findUnique({
    where: { id: presenterId },
    include: {
      section: {
        include: {
          conference: { select: { status: true } },
          hall: {
            include: { votingStatus: true },
          },
        },
      },
    },
  });

  if (!presenter) {
    return NextResponse.json({ error: "Докладчик не найден" }, { status: 404 });
  }

  // Reject if conference is finished
  if (presenter.section.conference.status === "FINISHED") {
    return NextResponse.json({ error: "Конференция завершена" }, { status: 403 });
  }

  // Check voting is open for this hall (sections without a hall can't be voted on)
  if (!presenter.section.hall?.votingStatus?.isOpen) {
    return NextResponse.json({ error: "Голосование не открыто" }, { status: 403 });
  }

  // Check jury member is assigned to this section
  const assignment = await prisma.jurySectionAssignment.findUnique({
    where: {
      juryMemberId_sectionId: {
        juryMemberId: session.id,
        sectionId: presenter.sectionId,
      },
    },
  });
  if (!assignment) {
    return NextResponse.json(
      { error: "Вы не назначены в эту секцию" },
      { status: 403 }
    );
  }

  // Validate against criterion bounds and conference membership
  const criterion = await prisma.criterion.findUnique({ where: { id: criterionId } });
  if (!criterion) {
    return NextResponse.json({ error: "Критерий не найден" }, { status: 404 });
  }
  if (criterion.conferenceId !== presenter.section.conferenceId) {
    return NextResponse.json({ error: "Критерий не принадлежит этой конференции" }, { status: 403 });
  }
  if (value !== null && value !== undefined) {
    if (value < criterion.minScore || value > criterion.maxScore) {
      return NextResponse.json(
        { error: `Оценка должна быть от ${criterion.minScore} до ${criterion.maxScore}` },
        { status: 400 }
      );
    }
  }

  const existing = await prisma.score.findUnique({
    where: {
      juryMemberId_presenterId_criterionId: {
        juryMemberId: session.id,
        presenterId,
        criterionId,
      },
    },
  });

  const score = await prisma.score.upsert({
    where: {
      juryMemberId_presenterId_criterionId: {
        juryMemberId: session.id,
        presenterId,
        criterionId,
      },
    },
    update: { previousValue: existing?.value, value: value ?? null },
    create: {
      juryMemberId: session.id,
      presenterId,
      criterionId,
      value: value ?? null,
    },
    include: { criterion: true },
  });

  const hallId = presenter.section.hall?.id ?? 0;
  emitScoreUpdate(hallId, {
    conferenceId: presenter.section.conferenceId,
    sectionId: presenter.sectionId,
    presenterId,
    criterionId,
    juryMemberId: session.id,
    value: score.value,
  });

  return NextResponse.json(score);
}
