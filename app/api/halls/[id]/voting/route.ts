import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { emitVotingStatus } from "@/lib/socket";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "organizer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const hallId = parseInt(id);
  const status = await prisma.votingStatus.findUnique({ where: { hallId } });
  return NextResponse.json(status ?? { hallId, isOpen: false });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "organizer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const hallId = parseInt(id);
  const { isOpen } = await req.json();

  if (isOpen === undefined) {
    return NextResponse.json({ error: "isOpen обязателен" }, { status: 400 });
  }

  const hall = await prisma.hall.findUnique({
    where: { id: hallId },
    select: { conferenceId: true },
  });

  const status = await prisma.votingStatus.upsert({
    where: { hallId },
    update: { isOpen },
    create: { hallId, isOpen },
  });

  if (hall) emitVotingStatus(hall.conferenceId, hallId, isOpen);
  return NextResponse.json(status);
}
