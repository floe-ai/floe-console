import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { consoleHome, identityFilePath } from "./paths.js";
import type { IdentityFile } from "./key-store.js";

/**
 * Reading and writing the encrypted identity store on disk. This module handles
 * only persistence; it never sees a passphrase or plaintext key.
 */

const IdentityFileSchema = z.object({
  version: z.literal(1),
  npub: z.string().min(1),
  created_at: z.string().min(1),
  kdf: z.object({
    name: z.literal("scrypt"),
    N: z.number().int().positive(),
    r: z.number().int().positive(),
    p: z.number().int().positive(),
    salt: z.string().min(1),
  }),
  cipher: z.object({
    name: z.literal("aes-256-gcm"),
    iv: z.string().min(1),
    ciphertext: z.string().min(1),
    tag: z.string().min(1),
  }),
});

/** True if an identity has already been created on this machine. */
export function identityExists(): boolean {
  return existsSync(identityFilePath());
}

/** Persist the encrypted identity, best-effort restricting file permissions. */
export function saveIdentityFile(file: IdentityFile): void {
  const path = identityFilePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(file, null, 2) + "\n", "utf8");
  chmodSafe(path, 0o600);
  chmodSafe(consoleHome(), 0o700);
}

/** Load and validate the stored identity, or null if none exists. */
export function loadIdentityFile(): IdentityFile | null {
  const path = identityFilePath();
  if (!existsSync(path)) return null;
  const parsed = IdentityFileSchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
  if (!parsed.success) {
    throw new Error(`The identity store at ${path} is unreadable or corrupt.`);
  }
  return parsed.data;
}

/** Remove the stored identity. The recovery phrase remains the only backup. */
export function deleteIdentityFile(): void {
  const path = identityFilePath();
  if (existsSync(path)) rmSync(path);
}

function chmodSafe(path: string, mode: number): void {
  try {
    chmodSync(path, mode);
  } catch {
    // Best effort. On Windows the profile directory ACL is the real boundary.
  }
}
