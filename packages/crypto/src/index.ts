// @tempest/crypto — NaCl primitives shared by desktop pairing (loopback dial)
// and mobile. Both sides derive the same session key from their ephemeral
// X25519 keypairs and use secretbox for the remaining frames.
//
// Platforms that lack webcrypto (React Native inside Expo Go) must call
// seedPrng() at startup with a byte source before any keygen call.

import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";

export const b64 = {
  enc: (b: Uint8Array): string => naclUtil.encodeBase64(b),
  dec: (s: string): Uint8Array => naclUtil.decodeBase64(s),
};

export const utf8 = {
  enc: (s: string): Uint8Array => naclUtil.decodeUTF8(s),
  dec: (b: Uint8Array): string => naclUtil.encodeUTF8(b),
};

export interface KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

/**
 * Seed tweetnacl's PRNG. Idempotent — safe to call from any platform init.
 * Desktop (webcrypto present) doesn't need this; mobile (Expo Go) does.
 */
export function seedPrng(source: (n: number) => Uint8Array): void {
  nacl.setPRNG((x, n) => {
    const buf = source(n);
    for (let i = 0; i < n; i++) x[i] = buf[i];
  });
}

export function newKeyPair(): KeyPair {
  const kp = nacl.box.keyPair();
  return { publicKey: kp.publicKey, secretKey: kp.secretKey };
}

export function randomBytes(n: number): Uint8Array {
  return nacl.randomBytes(n);
}

/** SSH-style short fingerprint: sha512(pubkey) → first 8 hex → aaaa-bbbb. */
export function fingerprint(pubkey: Uint8Array): string {
  const h = nacl.hash(pubkey);
  let hex = "";
  for (let i = 0; i < 4; i++) hex += h[i].toString(16).padStart(2, "0");
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function seal(plaintext: Uint8Array, key: Uint8Array): { nonce: string; box: string } {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const box = nacl.secretbox(plaintext, nonce, key);
  return { nonce: b64.enc(nonce), box: b64.enc(box) };
}

export function open(nonceB64: string, boxB64: string, key: Uint8Array): Uint8Array | null {
  const nonce = b64.dec(nonceB64);
  const box = b64.dec(boxB64);
  return nacl.secretbox.open(box, nonce, key) ?? null;
}

export function deriveSessionKey(peerPubkey: Uint8Array, mySecretkey: Uint8Array): Uint8Array {
  return nacl.box.before(peerPubkey, mySecretkey);
}
