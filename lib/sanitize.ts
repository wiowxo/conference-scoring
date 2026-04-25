export function sanitize(val: unknown, maxLen = 256): string {
  if (typeof val !== "string") return "";
  return val.trim().replace(/<[^>]*>/g, "").slice(0, maxLen);
}
