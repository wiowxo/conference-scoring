import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { emitConferenceEvent } from "@/lib/socket";
import { encryptPassword, decryptPassword } from "@/lib/crypto";
import { clientIp, securityLog } from "@/lib/security-log";
import { sanitize } from "@/lib/sanitize";

async function generateUniqueLogin(): Promise<string> {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let attempts = 0;
  while (attempts < 10) {
    const login = Array.from({ length: 5 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join("");
    const existing = await prisma.juryMember.findUnique({ where: { login } });
    if (!existing) return login;
    attempts++;
  }
  // Fallback: timestamp-based login
  return "j" + Date.now().toString(36).slice(-6);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "organizer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const juryMembers = await prisma.juryMember.findMany({
    where: { conferenceId: parseInt(id) },
    include: {
      sectionAssignments: { select: { sectionId: true } },
    },
    orderBy: { name: "asc" },
  });
  const result = juryMembers.map((m) => ({
    ...m,
    plaintextPassword: decryptPassword(m.plaintextPassword),
  }));
  return NextResponse.json(result);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "organizer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip = clientIp(req);
  const { id } = await params;
  const conferenceId = parseInt(id);
  const body = await req.json();
  const name = sanitize(body.name);
  const password = sanitize(body.password);

  if (!name || !password) {
    return NextResponse.json(
      { error: "name и password обязательны" },
      { status: 400 }
    );
  }
  if (name.length > 256) {
    return NextResponse.json({ error: "Название не должно превышать 256 символов" }, { status: 400 });
  }

  const login = await generateUniqueLogin();
  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const juryMember = await prisma.juryMember.create({
      data: { conferenceId, name, login, passwordHash, plaintextPassword: encryptPassword(password) },
      include: { sectionAssignments: { select: { sectionId: true } } },
    });
    securityLog("jury_created", { organizerId: session.id, juryMemberId: juryMember.id, conferenceId, ip });
    emitConferenceEvent(conferenceId, "jury:created", { juryMemberId: juryMember.id });
    return NextResponse.json(
      { ...juryMember, plaintextPassword: password },
      { status: 201 }
    );
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "Логин уже занят" }, { status: 409 });
    }
    console.error("Create jury member error:", err);
    return NextResponse.json({ error: "Ошибка при создании члена жюри" }, { status: 500 });
  }
}
