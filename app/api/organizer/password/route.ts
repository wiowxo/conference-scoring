import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getSession, signToken, TOKEN_COOKIE } from "@/lib/auth";
import { clientIp, securityLog, securityWarn } from "@/lib/security-log";

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  maxAge: 60 * 60 * 24,
  path: "/",
};

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "organizer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip = clientIp(req);
  const body = await req.json();
  const { currentPassword, newPassword } = body;

  if (!newPassword) {
    return NextResponse.json({ error: "Новый пароль обязателен" }, { status: 400 });
  }
  if (typeof newPassword !== "string" || newPassword.length < 6) {
    return NextResponse.json(
      { error: "Новый пароль должен содержать минимум 6 символов" },
      { status: 400 }
    );
  }

  const organizer = await prisma.organizer.findUnique({ where: { id: session.id } });
  if (!organizer) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Forced change (first login): skip current password verification
  // Voluntary change: require and verify current password
  if (!session.mustChangePassword) {
    if (!currentPassword) {
      return NextResponse.json({ error: "Текущий пароль обязателен" }, { status: 400 });
    }
    const valid = await bcrypt.compare(currentPassword, organizer.passwordHash);
    if (!valid) {
      securityWarn("organizer_password_change_failed", { organizerId: session.id, ip });
      return NextResponse.json({ error: "Неверный текущий пароль" }, { status: 400 });
    }
  }

  const hash = await bcrypt.hash(newPassword, 10);
  await prisma.organizer.update({
    where: { id: session.id },
    data: { passwordHash: hash, mustChangePassword: false },
  });

  securityLog("organizer_password_changed", { organizerId: session.id, ip });

  const newToken = signToken({
    id: session.id,
    login: session.login,
    name: session.name,
    role: "organizer",
    mustChangePassword: false,
  });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(TOKEN_COOKIE, newToken, COOKIE_OPTS);
  return res;
}
