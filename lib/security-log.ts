import { NextRequest } from "next/server";

export function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

type LogDetails = Record<string, string | number | boolean | null | undefined>;

export function securityLog(event: string, details: LogDetails): void {
  const ts = new Date().toISOString();
  const parts = Object.entries(details)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  console.log(`[SECURITY] ${ts} ${event} ${parts}`);
}

export function securityWarn(event: string, details: LogDetails): void {
  const ts = new Date().toISOString();
  const parts = Object.entries(details)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  console.error(`[SECURITY] ${ts} ${event} ${parts}`);
}
