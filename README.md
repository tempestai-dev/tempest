![Tempest — parallel AI agent sessions](media/wordmark.png)

<h2 align="center">
  <strong>The token-efficient, open-source alternative to Conductor.build.</strong>
</h2>

<p align="center">
  Run Claude Code, Aider, OpenCode, Copilot CLI, and more in parallel — each isolated in its own git worktree and branch. Zero merge conflicts, live status, built-in diff and PR.
</p>

<p align="center">
  <a href="https://github.com/gsvprharsha/tempest/releases">
    <img src="https://img.shields.io/github/v/release/gsvprharsha/tempest?style=for-the-badge" alt="Version" />
  </a>
  <a href="https://github.com/gsvprharsha/tempest">
    <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey?style=for-the-badge" alt="Platform" />
  </a>
  <a href="https://tauri.app/">
    <img src="https://img.shields.io/badge/built%20with-Tauri%202-orange?style=for-the-badge" alt="Tauri" />
  </a>
  <a href="https://github.com/gsvprharsha/tempest/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-Apache%202.0-green?style=for-the-badge" alt="License" />
  </a>
  <a href="https://github.com/gsvprharsha/tempest/actions/workflows/ci.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/gsvprharsha/tempest/ci.yml?branch=main&label=build&style=for-the-badge" alt="CI" />
  </a>
</p>

![Tempest — parallel AI agent sessions](media/tempest.png)

## Why Tempest uses far fewer tokens

Run five agents in parallel and each one reads your entire codebase from scratch — the same files, the same context, five times over. You pay for every token, every time.

**Token Intelligence** is a local code-knowledge graph that lives on your machine and is shared across every parallel agent session. When an agent needs to understand your codebase, it pulls from the shared graph instead of scanning files on its own. The work is done once. Every session benefits.

- **Up to 64% less context token consumption**
- **Up to 58% fewer tool calls**

No other parallel-agent tool does this.

## One window. Every agent. No collisions.

Claude Code, Aider, OpenCode, Copilot CLI, Cline, Goose — all running in parallel, each in its own isolated git worktree and branch. Agents never touch each other's files. No merge conflicts mid-run. No stashing. No detective work about who changed what.

A rogue agent run never touches your main branch or anyone else's work. **Blast radius: zero.**

- **Live status across every session** — know the moment each agent finishes, without babysitting.
- **Full history per session** — close a tab, reopen it, the agent picks up exactly where it left off.
- **Built-in diff and PR** — review each agent's changes, then stage, commit, push, and open a PR without leaving Tempest.

**Tempest is built using Tempest** — every feature in this repo was shipped by parallel agents running inside the app.


## What's next

**Database Branches** — isolated Postgres instances per agent session, so parallel runs never corrupt each other's data. Real copy, no shared state, no coordination required.

See [ROADMAP.md](ROADMAP.md) for the full picture. **Star this repo** — we announce here first.

## Build from source

Pre-built binaries are available for Windows, macOS, and Linux.

```bash
# Prerequisites: Node.js 18+, Rust 1.77+
# Windows also requires WebView2 Runtime:
# https://developer.microsoft.com/en-us/microsoft-edge/webview2/
git clone https://github.com/gsvprharsha/tempest
cd tempest
npm install
npm run dev        # development with hot reload
npm run build      # production build -> dist-installers/
```

## Community

[X (Twitter)](https://x.com/usetempest) — @usetempest

[GitHub](https://github.com/gsvprharsha/tempest)

[Instagram](https://instagram.com/usetempest)

[LinkedIn](https://linkedin.com/company/usetempest)
