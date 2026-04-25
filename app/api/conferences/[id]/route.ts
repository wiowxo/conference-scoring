import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { emitConferenceEvent, emitResultsPublished, emitVotingStatus } from "@/lib/socket";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "organizer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const conference = await prisma.conference.findUnique({
    where: { id: parseInt(id) },
    include: {
      halls: {
        include: {
          _count: { select: { sections: true } },
          votingStatus: true,
        },
      },
      criteria: true,
    },
  });
  if (!conference) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(conference);
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
  const confId = parseInt(id);
  const body = await req.json();

  const data: Record<string, unknown> = {};
  if (body.status !== undefined) data.status = body.status;
  if (body.resultsPublished !== undefined) data.resultsPublished = body.resultsPublished;
  if (typeof body.name === "string") {
    const name = body.name.trim().replace(/<[^>]*>/g, "");
    if (name.length > 256) {
      return NextResponse.json({ error: "Название не должно превышать 256 символов" }, { status: 400 });
    }
    data.name = name;
  }
  if (typeof body.date === "string") data.date = new Date(body.date);
  if (typeof body.useSlider === "boolean") data.useSlider = body.useSlider;
  if (typeof body.useDefaultRange === "boolean") data.useDefaultRange = body.useDefaultRange;
  if (body.qualityZonesTemplate !== undefined) data.qualityZonesTemplate = body.qualityZonesTemplate;

  // When finishing: auto-close all voting and auto-publish results
  if (body.status === "FINISHED") {
    data.resultsPublished = true;

    // Find all open halls and close them
    const openHalls = await prisma.votingStatus.findMany({
      where: { hall: { conferenceId: confId }, isOpen: true },
      select: { hallId: true },
    });
    if (openHalls.length > 0) {
      await prisma.votingStatus.updateMany({
        where: { hall: { conferenceId: confId } },
        data: { isOpen: false },
      });
      // Emit socket events for each hall
      for (const { hallId } of openHalls) {
        emitVotingStatus(confId, hallId, false);
      }
    }
  }

  const updated = await prisma.conference.update({
    where: { id: confId },
    data,
  });

  if (data.resultsPublished === true) {
    emitResultsPublished(updated.id);
  }

  if (data.status !== undefined) {
    emitConferenceEvent(confId, "conference:status:changed", {
      status: updated.status,
      resultsPublished: updated.resultsPublished,
    });
  } else if (data.name !== undefined || data.date !== undefined || data.useSlider !== undefined) {
    emitConferenceEvent(confId, "conference:updated", {
      name: updated.name,
      useSlider: updated.useSlider,
    });
  }

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
  try {
    await prisma.conference.delete({ where: { id: parseInt(id) } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Delete conference error:", err);
    return NextResponse.json(
      { error: "Невозможно удалить конференцию: есть связанные данные" },
      { status: 409 }
    );
  }
}
