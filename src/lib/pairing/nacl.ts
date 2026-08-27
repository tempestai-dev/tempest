// NaCl primitives shared by the desktop pairing flow. Same shape lives on
// mobile (apps/mobile/lib/pairing.js) — keep the two in sync until Phase 2
// extracts them into packages/crypto.
//
// Wire: pairing_secret authenticates the very first hello (proves the QR
// scan). After that, both sides derive a session key from their ephemeral
// X25519 keypairs and use secretbox for the remaining frames.

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

export function newKeyPair(): KeyPair {
  const kp = nacl.box.keyPair();
  return { publicKey: kp.publicKey, secretKey: kp.secretKey };
}

export function randomBytes(n: number): Uint8Array {
  return nacl.randomBytes(n);
}

// SSH-style short fingerprint of a pubkey: sha512 → 8 hex → aaaa-bbbb.
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

// Secretbox under an arbitrary 32-byte key.
export function seal(plaintext: Uint8Array, key: Uint8Array): { nonce: string; box: string } {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const box = nacl.secretbox(plaintext, nonce, key);
  return { nonce: b64.enc(nonce), box: b64.enc(box) };
}

export function open(nonceB64: string, boxB64: string, key: Uint8Array): Uint8Array | null {
  const nonce = b64.dec(nonceB64);
  const box = b64.dec(boxB64);
  const out = nacl.secretbox.open(box, nonce, key);
  return out ?? null;
}

// Derive the session key both sides use for post-hello frames.
export function deriveSessionKey(peerPubkey: Uint8Array, mySecretkey: Uint8Array): Uint8Array {
  return nacl.box.before(peerPubkey, mySecretkey);
}
