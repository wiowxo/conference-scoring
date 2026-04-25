import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { emitConferenceEvent } from "@/lib/socket";
import { encryptPassword, decryptPassword } from "@/lib/crypto";
import { clientIp, securityLog } from "@/lib/security-log";
import { sanitize } from "@/lib/sanitize";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "organizer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip = clientIp(req);
  const { id } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (typeof body.name === "string") {
    const name = sanitize(body.name);
    if (name.length > 256) {
      return NextResponse.json({ error: "Название не должно превышать 256 символов" }, { status: 400 });
    }
    data.name = name;
  }
  if (typeof body.login === "string") {
    const login = sanitize(body.login).slice(0, 50);
    if (!/^[a-z0-9]+$/i.test(login)) {
      return NextResponse.json(
        { error: "Логин должен содержать только буквы и цифры" },
        { status: 400 }
      );
    }
    data.login = login;
  }
  let passwordChanged = false;
  if (typeof body.password === "string" && body.password.trim()) {
    const plaintext = body.password.trim();
    data.passwordHash = await bcrypt.hash(plaintext, 10);
    data.plaintextPassword = encryptPassword(plaintext);
    passwordChanged = true;
  }

  try {
    const updated = await prisma.juryMember.update({
      where: { id: parseInt(id) },
      data,
      select: { id: true, name: true, login: true, conferenceId: true, plaintextPassword: true },
    });
    if (passwordChanged) {
      securityLog("jury_password_changed", { organizerId: session.id, juryMemberId: updated.id, ip });
    }
    emitConferenceEvent(updated.conferenceId, "jury:updated", { juryMemberId: updated.id });
    return NextResponse.json({
      ...updated,
      plaintextPassword: decryptPassword(updated.plaintextPassword),
    });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "Логин уже занят" }, { status: 409 });
    }
    throw err;
  }
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
  const juryMemberId = parseInt(id);
  const juryMember = await prisma.juryMember.findUnique({
    where: { id: juryMemberId },
    select: { conferenceId: true },
  });
  try {
    await prisma.juryMember.delete({ where: { id: juryMemberId } });
    if (juryMember) {
      emitConferenceEvent(juryMember.conferenceId, "jury:deleted", { juryMemberId });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Delete jury member error:", err);
    return NextResponse.json(
      { error: "Невозможно удалить члена жюри" },
      { status: 409 }
    );
  }
}
