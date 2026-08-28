import { seal, open, utf8 } from "@tempest/crypto";
import type { WireFrame } from "@tempest/core";

export interface EncryptedFrame {
  n: string;
  c: string;
}

export function encryptFrame(frame: WireFrame, sessionKey: Uint8Array): string {
  const plaintext = utf8.enc(JSON.stringify(frame));
  const { nonce, box } = seal(plaintext, sessionKey);
  return JSON.stringify({ n: nonce, c: box } satisfies EncryptedFrame);
}

export function decryptFrame(raw: string, sessionKey: Uint8Array): WireFrame | null {
  let outer: EncryptedFrame;
  try { outer = JSON.parse(raw); } catch { return null; }
  if (!outer || typeof outer.n !== "string" || typeof outer.c !== "string") return null;
  const plain = open(outer.n, outer.c, sessionKey);
  if (!plain) return null;
  try { return JSON.parse(utf8.dec(plain)) as WireFrame; } catch { return null; }
}
