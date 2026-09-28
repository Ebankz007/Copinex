import { createCipheriv, createDecipheriv, createHmac, randomBytes, scryptSync } from 'node:crypto';
import { env } from '../config/env.js';

/**
 * TOTP (RFC 6238) + secret-at-rest encryption for two-factor auth.
 *
 * Deliberately dependency-free: TOTP is HMAC-SHA1 with dynamic truncation
 * (~30 lines), and pulling an authenticator library in for that would add
 * supply-chain surface to the most security-sensitive endpoint in the API.
 * Verified against the RFC 6238 test vectors in the 2FA integration suite.
 */

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Buffer): string {
  let out = '';
  let bits = 0;
  let value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, '').toUpperCase();
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of clean) {
    const idx = BASE32.indexOf(char);
    if (idx < 0) throw new Error('Invalid base32 secret');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A fresh 160-bit authenticator secret, base32-encoded (32 chars). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** The 6-digit code for a given moment (defaults to now). Testable via `at`. */
export function totpCode(secretBase32: string, at: number = Date.now(), stepSeconds = 30): string {
  const key = base32Decode(secretBase32);
  const counter = Math.floor(at / 1000 / stepSeconds);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', key).update(msg).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    (hmac[offset + 1]! << 16) |
    (hmac[offset + 2]! << 8) |
    hmac[offset + 3]!;
  return String(code % 1_000_000).padStart(6, '0');
}

/**
 * Accept the current step plus `window` steps either side (default ±1):
 * covers clock skew and the code typed just as a step rolls over.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  at: number = Date.now(),
  window = 1,
): boolean {
  const clean = code.replace(/[\s-]/g, '');
  if (!/^\d{6}$/.test(clean)) return false;
  const stepMs = 30_000;
  for (let i = -window; i <= window; i++) {
    if (totpCode(secretBase32, at + i * stepMs) === clean) return true;
  }
  return false;
}

/** The otpauth:// URL the member scans into their authenticator app. */
export function otpauthUrl(email: string, secretBase32: string, issuer = 'Copinex'): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(email)}`;
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30`;
}

// ── Secret-at-rest encryption ──────────────────────────────
// A database read alone must never yield a working second factor, so the
// secret is stored AES-256-GCM encrypted under a key derived from
// JWT_SECRET. Consequence, stated plainly: rotating JWT_SECRET invalidates
// every enrolled secret and affected members must re-enroll. That belongs in
// the key-rotation runbook when one is written.

function totpKey(): Buffer {
  return scryptSync(env.JWT_SECRET, 'copinex-totp-v1', 32);
}

export function encryptTotpSecret(secretBase32: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', totpKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secretBase32, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64')}.${ciphertext.toString('base64')}.${tag.toString('base64')}`;
}

export function decryptTotpSecret(stored: string): string {
  const [version, ivB64, ctB64, tagB64] = stored.split('.');
  if (version !== 'v1' || !ivB64 || !ctB64 || !tagB64) {
    throw new Error('Unsupported TOTP secret envelope');
  }
  const decipher = createDecipheriv('aes-256-gcm', totpKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
}

// ── Backup codes ───────────────────────────────────────────
// Ten single-use recovery codes, shown once at enable time. Only sha256
// hashes touch the database; verification burns the code.

const BACKUP_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateBackupCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    // 8 bytes → 8 chars → displayed as XXXX-XXXX.
    const bytes = randomBytes(8);
    let code = '';
    for (const b of bytes) code += BACKUP_ALPHABET[b % BACKUP_ALPHABET.length];
    codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
  }
  return codes;
}

/** Normalise user-typed codes so `abcd-efgh`, `abcd efgh`, `abcdefgh` all match. */
export function normaliseBackupCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}
