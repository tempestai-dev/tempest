![Tempest -- parallel AI agent sessions](media/wordmark.png)

<h2 align="center">
  <strong>Run a fleet of token-efficient AI coding agents in parallel -- each isolated, none colliding.</strong>
</h2>

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

![Tempest -- parallel AI agent sessions](media/tempest.png)

Bring your favorite AI coding tools together. Claude Code, Aider, OpenCode, and more -- all from one interface, each on its own branch, each with its own conversation history. No conflicts. No waiting. No context switching.

If you're three tabs deep in Claude Code right now -- stashing changes, guessing which agent touched which file, losing the thread of what each one was even doing -- that's the exact problem Tempest was built to end.

**Tempest is built using Tempest** -- every feature in this repo was shipped by parallel agents running inside the app.

> Built in public - Early Access - v0.1.0 - Windows binary

## Why not just open more terminals?

Because more windows don't give you more isolation -- they give you more chaos. Every agent in Tempest gets its own branch -- nothing ever steps on anything else. Close a tab and the agent's full conversation history is preserved exactly where you left it. Reopen it and it keeps going. You see, at a glance, which agents are working and which just finished -- no babysitting, no stash juggling, no detective work. The state is managed for you, so you can actually run five agents instead of pretending to.

A rogue agent run never touches your main branch or anyone else's work. Blast radius: zero.

## What you can do today

**One interface for every agent**
Claude Code, Aider, OpenCode, Copilot CLI, Cline, Goose -- all running in parallel, all in one window. Switch tools the same way you switch tabs.

**Parallel sessions, zero conflicts**
Each session runs in its own isolated git worktree. Agents never touch each other's files -- no merge conflicts mid-run, no stepping on uncommitted changes.

**Session continuity**
Close a tab, reopen it. The agent picks up exactly where it left off with full conversation history intact.

**Never babysit a session again**
Live status across every open session. Know the moment each agent finishes a turn without watching it.

**Built-in diff and push**
Review what each agent changed in a stream diff viewer. Stage, commit, push, and open a PR without leaving Tempest.

**Live preview**
Watch your local dev server update live as agents make changes -- no alt-tab, no second monitor.

**Native experience**
Everything you expect from a real terminal -- ANSI color, in-session search, clickable URLs -- nothing in the way.

## What's next

Two capabilities in active development:

**Token Intelligence** -- a local code-knowledge graph that eliminates redundant file reads across agent sessions, cutting context consumption by up to 64% and tool calls by up to 58%.

**Database Branches** -- isolated Postgres instances per agent session so parallel runs never corrupt each other's data. Real copy, no shared state, no coordination required.

See [ROADMAP.md](ROADMAP.md) for the full picture. **Star this repo** -- we announce here first.

## Build from source

Pre-built binaries are Windows-only. Building from source works on Windows, macOS, and Linux.

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

[X (Twitter)](https://x.com/usetempest) -- @usetempest

[GitHub](https://github.com/gsvprharsha/tempest)

[Instagram](https://instagram.com/usetempest)

[LinkedIn](https://linkedin.com/company/usetempest)
