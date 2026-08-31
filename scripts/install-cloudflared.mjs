// Downloads the platform-appropriate cloudflared binary into
// src-tauri/binaries/ so the Tauri sidecar can find it.
//
// cloudflared is Apache-2.0 and its GitHub releases publish a stable set of
// per-platform artifacts. We only fetch what the current host needs — CI
// jobs on each target platform pull down their own binary.
//
// Skips the download if the file already exists (postinstall runs on every
// `npm install`).

import { createWriteStream } from 'node:fs';
import { chmod, mkdir, rename, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const BIN_DIR = resolve(REPO_ROOT, 'src-tauri', 'binaries');

const LATEST_RELEASE_URL =
  'https://github.com/cloudflare/cloudflared/releases/latest/download';

// Key by Rust target triple so a caller can request a specific cross-target
// (e.g. building x86_64-apple-darwin on an arm64 runner) instead of always
// grabbing the host's binary.
const ARTIFACTS = {
  'x86_64-pc-windows-msvc':      { asset: 'cloudflared-windows-amd64.exe', ext: '.exe', archive: null },
  'x86_64-apple-darwin':         { asset: 'cloudflared-darwin-amd64.tgz',  ext: '',     archive: 'tgz' },
  'aarch64-apple-darwin':        { asset: 'cloudflared-darwin-arm64.tgz',  ext: '',     archive: 'tgz' },
  'x86_64-unknown-linux-gnu':    { asset: 'cloudflared-linux-amd64',       ext: '',     archive: null },
  'aarch64-unknown-linux-gnu':   { asset: 'cloudflared-linux-arm64',       ext: '',     archive: null },
};

const HOST_TARGETS = {
  'win32:x64':    'x86_64-pc-windows-msvc',
  'darwin:x64':   'x86_64-apple-darwin',
  'darwin:arm64': 'aarch64-apple-darwin',
  'linux:x64':    'x86_64-unknown-linux-gnu',
  'linux:arm64':  'aarch64-unknown-linux-gnu',
};

// Explicit target wins (CLI arg or env var), else fall back to the host.
const resolveTarget = () => {
  const explicit = process.argv[2] || process.env.CLOUDFLARED_TARGET;
  if (explicit) return explicit.trim();
  return HOST_TARGETS[`${process.platform}:${process.arch}`] || null;
};

const platformArtifact = () => {
  const targetTriple = resolveTarget();
  if (!targetTriple) return null;
  const spec = ARTIFACTS[targetTriple];
  if (!spec) return null;
  return { ...spec, targetTriple };
};

const exists = async (p) => {
  try { await stat(p); return true; } catch { return false; }
};

const download = async (url, dest) => {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  await pipeline(res.body, createWriteStream(dest));
};

const extractTgz = (archive, outDir) =>
  new Promise((res, rej) => {
    const p = spawn('tar', ['xzf', archive, '-C', outDir], { stdio: 'inherit' });
    p.on('close', (code) => (code === 0 ? res() : rej(new Error(`tar exited ${code}`))));
    p.on('error', rej);
  });

const main = async () => {
  const spec = platformArtifact();
  if (!spec) {
    const requested = process.argv[2] || process.env.CLOUDFLARED_TARGET;
    if (requested) {
      console.warn(`[install-cloudflared] unknown target triple '${requested}'; skipping`);
    } else {
      console.warn(`[install-cloudflared] no artifact for ${process.platform}/${process.arch}; skipping`);
    }
    return;
  }
  await mkdir(BIN_DIR, { recursive: true });
  const finalPath = resolve(BIN_DIR, `cloudflared-${spec.targetTriple}${spec.ext}`);
  if (await exists(finalPath)) return;

  const url = `${LATEST_RELEASE_URL}/${spec.asset}`;
  console.log(`[install-cloudflared] fetching ${url}`);

  if (spec.archive === 'tgz') {
    const archivePath = resolve(BIN_DIR, spec.asset);
    await download(url, archivePath);
    await extractTgz(archivePath, BIN_DIR);
    await rename(resolve(BIN_DIR, 'cloudflared'), finalPath);
  } else {
    const tmp = `${finalPath}.part`;
    await download(url, tmp);
    await rename(tmp, finalPath);
  }

  if (process.platform !== 'win32') await chmod(finalPath, 0o755);
  console.log(`[install-cloudflared] wrote ${finalPath}`);
};

main().catch((e) => {
  console.error('[install-cloudflared] failed:', e.message);
  // Non-fatal: developer can install cloudflared globally and the sidecar
  // falls back to a PATH lookup at runtime.
  process.exit(0);
});
