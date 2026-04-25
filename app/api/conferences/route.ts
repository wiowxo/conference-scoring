import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { sanitize } from "@/lib/sanitize";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "organizer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const conferences = await prisma.conference.findMany({
    include: {
      _count: { select: { halls: true, criteria: true } },
    },
    orderBy: { date: "desc" },
  });
  return NextResponse.json(conferences);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "organizer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const name = sanitize(body.name);
  const date = typeof body.date === "string" ? body.date.trim() : "";

  if (!name || !date) {
    return NextResponse.json({ error: "name и date обязательны" }, { status: 400 });
  }
  if (name.length > 256) {
    return NextResponse.json({ error: "Название не должно превышать 256 символов" }, { status: 400 });
  }

  const conference = await prisma.conference.create({
    data: { name, date: new Date(date) },
  });
  return NextResponse.json(conference, { status: 201 });
}
