import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const conferenceId = req.nextUrl.searchParams.get("conferenceId");

  if (!conferenceId) {
    return NextResponse.json({ error: "conferenceId обязателен" }, { status: 400 });
  }

  const conference = await prisma.conference.findUnique({
    where: { id: parseInt(conferenceId) },
  });
  if (!conference) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const session = await getSession();
  if (!conference.resultsPublished && session?.role !== "organizer") {
    return NextResponse.json({ error: "Результаты не опубликованы" }, { status: 403 });
  }

  const criteria = await prisma.criterion.findMany({
    where: { conferenceId: parseInt(conferenceId) },
    orderBy: [{ order: "asc" }, { name: "asc" }],
  });

  const sections = await prisma.section.findMany({
    where: { conferenceId: parseInt(conferenceId) },
    include: {
      hall: { select: { name: true } },
      presenters: {
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        include: {
          scores: {
            where: { isValid: true },
            include: { criterion: true },
          },
        },
      },
    },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });

  const criteriaCount = criteria.length;

  const results = sections.map((section) => ({
    sectionId: section.id,
    sectionName: section.name,
    hall: section.hall?.name ?? "—",
    presenters: section.presenters.map((presenter) => {
      // Group valid scores by juryMemberId
      const byJury = new Map<number, typeof presenter.scores>();
      for (const score of presenter.scores) {
        if (score.value === null) continue;
        if (!byJury.has(score.juryMemberId)) byJury.set(score.juryMemberId, []);
        byJury.get(score.juryMemberId)!.push(score);
      }
      // Only count jury members who have scored ALL criteria (complete evaluations)
      const completeScores = [...byJury.values()]
        .filter((juryScores) => juryScores.length >= criteriaCount)
        .flat();

      const criteriaScores = criteria.map((criterion) => {
        const relevant = completeScores.filter((s) => s.criterionId === criterion.id);
        const avg =
          relevant.length > 0
            ? relevant.reduce((sum, s) => sum + (s.value ?? 0), 0) / relevant.length
            : null;
        return {
          criterionId: criterion.id,
          criterionName: criterion.name,
          average: avg !== null ? Math.round(avg * 100) / 100 : null,
          count: relevant.length,
        };
      });

      const validCriteria = criteriaScores.filter((c) => c.average !== null);
      const totalAvg =
        validCriteria.length > 0
          ? validCriteria.reduce((sum, c) => sum + (c.average ?? 0), 0) /
            validCriteria.length
          : null;

      return {
        presenterId: presenter.id,
        name: presenter.name,
        topic: presenter.topic,
        supervisor: presenter.supervisor ?? null,
        position: presenter.position ?? null,
        order: presenter.order,
        criteriaScores,
        totalAverage: totalAvg !== null ? Math.round(totalAvg * 100) / 100 : null,
      };
    }),
  }));

  return NextResponse.json({ conference, criteria, results });
}
