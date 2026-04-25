// Symmetric encryption for plaintextPassword storage.
// Requires ENCRYPTION_KEY env variable (any string; derived to 32 bytes via SHA-256).
// Falls back to plaintext with a warning if the key is absent (backwards-compatible).
// Encrypted format: "enc:<ivHex>:<tagHex>:<dataHex>"
// Plaintext values (legacy or no key) are returned unchanged by decryptPassword.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const PREFIX = "enc:";

function deriveKey(): Buffer | null {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) return null;
  return createHash("sha256").update(raw).digest();
}

export function encryptPassword(plaintext: string): string {
  const key = deriveKey();
  if (!key) {
    console.warn(
      "[SECURITY] ENCRYPTION_KEY not set — plaintextPassword stored unencrypted"
    );
    return plaintext;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decryptPassword(stored: string | null | undefined): string {
  if (!stored) return "";
  if (!stored.startsWith(PREFIX)) return stored; // legacy plaintext — return as-is
  const key = deriveKey();
  if (!key) {
    console.error("[SECURITY] ENCRYPTION_KEY not set — cannot decrypt plaintextPassword");
    return "";
  }
  try {
    const parts = stored.slice(PREFIX.length).split(":");
    if (parts.length !== 3) return "";
    const [ivHex, tagHex, dataHex] = parts;
    const decipher = createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(ivHex, "hex")
    );
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataHex, "hex")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    console.error("[SECURITY] Failed to decrypt plaintextPassword");
    return "";
  }
}
