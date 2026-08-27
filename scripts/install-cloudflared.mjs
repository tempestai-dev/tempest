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

const platformArtifact = () => {
  const p = process.platform;
  const a = process.arch;
  if (p === 'win32' && a === 'x64') {
    return {
      asset: 'cloudflared-windows-amd64.exe',
      targetTriple: 'x86_64-pc-windows-msvc',
      ext: '.exe',
      archive: null,
    };
  }
  if (p === 'darwin' && a === 'x64') {
    return {
      asset: 'cloudflared-darwin-amd64.tgz',
      targetTriple: 'x86_64-apple-darwin',
      ext: '',
      archive: 'tgz',
    };
  }
  if (p === 'darwin' && a === 'arm64') {
    return {
      asset: 'cloudflared-darwin-arm64.tgz',
      targetTriple: 'aarch64-apple-darwin',
      ext: '',
      archive: 'tgz',
    };
  }
  if (p === 'linux' && a === 'x64') {
    return {
      asset: 'cloudflared-linux-amd64',
      targetTriple: 'x86_64-unknown-linux-gnu',
      ext: '',
      archive: null,
    };
  }
  if (p === 'linux' && a === 'arm64') {
    return {
      asset: 'cloudflared-linux-arm64',
      targetTriple: 'aarch64-unknown-linux-gnu',
      ext: '',
      archive: null,
    };
  }
  return null;
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
    console.warn(`[install-cloudflared] no artifact for ${process.platform}/${process.arch}; skipping`);
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
