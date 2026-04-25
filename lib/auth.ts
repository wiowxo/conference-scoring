import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-change-me";
const TOKEN_COOKIE = "auth_token";

export type UserRole = "organizer" | "jury";

export interface JWTPayload {
  id: number;
  login: string;
  name: string;
  role: UserRole;
  conferenceId?: number;
  mustChangePassword?: boolean;
}

export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "24h" });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<JWTPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(TOKEN_COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export function getSessionFromRequest(req: NextRequest): JWTPayload | null {
  const token = req.cookies.get(TOKEN_COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export { TOKEN_COOKIE };
