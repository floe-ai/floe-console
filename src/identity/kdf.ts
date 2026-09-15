import { scryptSync } from "node:crypto";

/**
 * Key-derivation for the at-rest identity key. (Decision D-KDF.)
 *
 * Choice: Node's built-in **scrypt**, defended on merits rather than on
 * "avoids a native module" — Argon2id via WebAssembly (hash-wasm) also needs no
 * native build, so that argument does not hold. The real arguments for scrypt
 * here are:
 *
 *   1. It is in the Node standard library, so **no dependency sits in the trust
 *      path that guards a human's private key**. Fewer moving parts guarding a
 *      secret is a genuine supply-chain security property, not mere convenience.
 *   2. scrypt is a memory-hard, well-analysed KDF; it is an accepted choice for
 *      password-based key derivation (OWASP Password Storage Cheat Sheet lists
 *      it alongside Argon2id).
 *
 * Parameters are tuned for a **file at rest** (offline-guessing threat model),
 * not an interactive login, so they are stronger than a login-latency default.
 * These are the OWASP scrypt minimums for password storage:
 *
 *   N = 2^17 (131072)   cost / iteration count
 *   r = 8               block size
 *   p = 1               parallelism
 *
 * Memory cost is ~128 * r * N bytes ≈ 128 MiB, which is the point: it makes
 * large-scale offline guessing expensive. `maxmem` is raised above that floor so
 * Node does not reject the derivation.
 *
 * The parameters that actually decrypt a file are read from that file's own
 * `kdf` block (older files keep verifying if these constants ever change); these
 * constants are only what NEW files are written with.
 */
export const KDF_PARAMS = {
  name: "scrypt",
  /** Cost factor. Must be a power of two. */
  N: 2 ** 17,
  /** Block size. */
  r: 8,
  /** Parallelism. */
  p: 1,
} as const;

/** Derived-key length in bytes (AES-256 key). */
export const KDF_KEY_LENGTH = 32;

/**
 * Upper bound on scrypt memory. scrypt needs ~128 * r * N bytes; at N=2^17,r=8
 * that is ~128 MiB, so allow 256 MiB of headroom.
 */
export const KDF_MAXMEM = 256 * 1024 * 1024;

export interface ScryptParams {
  readonly N: number;
  readonly r: number;
  readonly p: number;
}

/** Derive a wrapping key from a passphrase and salt using the given scrypt params. */
export function deriveWrappingKey(passphrase: string, salt: Buffer, params: ScryptParams): Buffer {
  return scryptSync(passphrase.normalize("NFKC"), salt, KDF_KEY_LENGTH, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: KDF_MAXMEM,
  });
}
