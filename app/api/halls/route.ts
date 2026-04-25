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
  if (!conferenceId) {
    return NextResponse.json({ error: "conferenceId обязателен" }, { status: 400 });
  }

  const halls = await prisma.hall.findMany({
    where: { conferenceId: parseInt(conferenceId) },
    include: {
      sections: {
        include: {
          presenters: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
        },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      },
      votingStatus: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(halls);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "organizer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const name = sanitize(body.name);
  const conferenceId =
    typeof body.conferenceId === "number" ? body.conferenceId : parseInt(body.conferenceId);

  if (!name || !conferenceId) {
    return NextResponse.json({ error: "name и conferenceId обязательны" }, { status: 400 });
  }
  if (name.length > 256) {
    return NextResponse.json({ error: "Название не должно превышать 256 символов" }, { status: 400 });
  }

  const hall = await prisma.hall.create({
    data: { name, conferenceId },
  });
  emitConferenceEvent(conferenceId, "hall:created", { hallId: hall.id });
  return NextResponse.json(hall, { status: 201 });
}
