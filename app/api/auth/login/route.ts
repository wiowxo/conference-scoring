import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signToken, TOKEN_COOKIE } from "@/lib/auth";
import { clientIp, securityLog, securityWarn } from "@/lib/security-log";

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  maxAge: 60 * 60 * 24,
  path: "/",
};

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const { login, password, role } = await req.json();

  if (!login || !password || !role) {
    return NextResponse.json(
      { error: "login, password и role обязательны" },
      { status: 400 }
    );
  }

  if (role === "organizer") {
    const organizer = await prisma.organizer.findUnique({ where: { login } });
    if (!organizer || !(await bcrypt.compare(password, organizer.passwordHash))) {
      securityWarn("login_failed", { role: "organizer", login, ip });
      return NextResponse.json({ error: "Неверные учётные данные" }, { status: 401 });
    }

    securityLog("login_success", { role: "organizer", id: organizer.id, login, ip });

    const token = signToken({
      id: organizer.id,
      login: organizer.login,
      name: organizer.login,
      role: "organizer",
      mustChangePassword: organizer.mustChangePassword,
    });

    const res = NextResponse.json({ token, role: "organizer", id: organizer.id });
    res.cookies.set(TOKEN_COOKIE, token, COOKIE_OPTS);
    return res;
  }

  if (role === "jury") {
    const juryMember = await prisma.juryMember.findUnique({ where: { login } });
    if (!juryMember || !(await bcrypt.compare(password, juryMember.passwordHash))) {
      securityWarn("login_failed", { role: "jury", login, ip });
      return NextResponse.json({ error: "Неверные учётные данные" }, { status: 401 });
    }

    securityLog("login_success", { role: "jury", id: juryMember.id, login, ip });

    const token = signToken({
      id: juryMember.id,
      login: juryMember.login,
      name: juryMember.name,
      role: "jury",
      conferenceId: juryMember.conferenceId,
    });

    const res = NextResponse.json({
      token,
      role: "jury",
      id: juryMember.id,
      conferenceId: juryMember.conferenceId,
    });
    res.cookies.set(TOKEN_COOKIE, token, COOKIE_OPTS);
    return res;
  }

  return NextResponse.json({ error: "Неверная роль" }, { status: 400 });
}
