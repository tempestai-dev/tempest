![Tempest — parallel AI agent sessions](media/banner.png)

<div align="center">

[Download](https://tempestai.dev/download) · [Docs](https://tempestai.dev/docs) · [Releases](https://github.com/tempestai-dev/tempest/releases/latest) · [Benchmarks](#why-tempest-uses-far-fewer-tokens) · [Discord](https://discord.gg/bRQhAKKVa8) · [Contributing](CONTRIBUTING.md)

</div>

<br>

<p align="center">
  <a href="https://github.com/tempestai-dev/tempest/releases">
    <img src="https://img.shields.io/github/v/release/tempestai-dev/tempest" alt="Version" />
  </a>
  <a href="https://github.com/tempestai-dev/tempest/releases">
    <img src="https://img.shields.io/github/downloads/tempestai-dev/tempest/total?color=2ea043" alt="Downloads" />
  </a>
  <img src="https://img.shields.io/badge/macOS-Supported-grey?logo=apple&logoColor=white&labelColor=000000" alt="macOS" />
  <img src="https://custom-icon-badges.demolab.com/badge/Windows-Supported-grey?logo=windows11&logoColor=white&labelColor=0078D6" alt="Windows" />
  <img src="https://img.shields.io/badge/Linux-Supported-grey?logo=linux&logoColor=black&labelColor=FCC624" alt="Linux" />
  <a href="https://tauri.app/">
    <img src="https://img.shields.io/badge/built%20with-Tauri%202-orange" alt="Tauri" />
  </a>
  <a href="https://github.com/tempestai-dev/tempest/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-Apache%202.0-green" alt="License" />
  </a>
  <a href="https://github.com/tempestai-dev/tempest/actions/workflows/ci.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/tempestai-dev/tempest/ci.yml?branch=main&label=build" alt="CI" />
  </a>
  <a href="https://scorecard.dev/viewer/?uri=github.com/tempestai-dev/tempest">
    <img src="https://img.shields.io/ossf-scorecard/github.com/tempestai-dev/tempest?label=openssf%20scorecard" alt="OpenSSF Scorecard" />
  </a>
  <a href="https://discord.gg/bRQhAKKVa8">
    <img src="https://img.shields.io/badge/Discord-Join-5865F2?logo=discord&logoColor=white" alt="Discord" />
  </a>
</p>


<h2 align="center">
  <strong>Run Claude Code, Codex, Gemini and any other CLI Agent with 86% fewer tokens</strong>
</h2>

<p align="center">
  Tempest indexes your codebase once and gives every agent a shared knowledge base, so they spend less context understanding your code and more tokens actually building.
</p>

![Tempest — parallel AI agent sessions](media/tempest.png)

## Why Tempest uses far fewer tokens

Measured across 7 open-source repos — same agent, same model, same prompts, only variable is whether Token Intelligence is wired in:

| Repo | Language | Tokens with Tempest | Tokens without Tempest | Tokens saved | Tool calls with Tempest | Tool calls without Tempest | Calls saved |
|---|---|---|---|---|---|---|---|
| `tokio` | Rust | 119K | 1.02M | **88%** | 3.5 | 26 | 87% |
| `okhttp` | Kotlin | 73K | 417K | **83%** | 2 | 21.5 | 91% |
| `excalidraw` | TypeScript | 210K | 1.19M | **82%** | 5.5 | 33.5 | 84% |
| `django` | Python | 78K | 416K | **81%** | 2 | 24.5 | 92% |
| `gin` | Go | 84K | 243K | **66%** | 2.5 | 8.5 | 71% |
| `alamofire` | Swift | 184K | 493K | **63%** | 5.5 | 17.5 | 69% |
| `vscode` | TypeScript | 307K | 676K | **55%** | 9 | 24.5 | 63% |

Per-repo medians over 4 valid runs per arm. Full methodology and reproduce steps: [BENCHMARKS.md](BENCHMARKS.md).

Run five agents in parallel and each one reads your entire codebase from scratch — the same files, the same context, five times over. You pay for every token, every time.

**Token Intelligence** is a local code-knowledge graph that lives on your machine and is shared across every parallel agent session. When an agent needs to understand your codebase, it pulls from the shared graph instead of scanning files on its own. The work is done once. Every session benefits.

No other parallel-agent tool does this.

## One window. Every agent. No collisions.

Claude Code, Aider, OpenCode, Copilot CLI, Cline, Goose — all running in parallel, each in its own isolated git worktree and branch. Agents never touch each other's files. No merge conflicts mid-run. No stashing. No detective work about who changed what.

A rogue agent run never touches your main branch or anyone else's work. **Blast radius: zero.**

- **Live status across every session** — know the moment each agent finishes, without babysitting.
- **Full history per session** — close a tab, reopen it, the agent picks up exactly where it left off.
- **Built-in diff and PR** — review each agent's changes, then stage, commit, push, and open a PR without leaving Tempest.

## Process-isolated. Fully autonomous. Out of the box.

Every agent session in Tempest runs inside **Hephaestus** — a first-party process isolation layer built into the app. No configuration required.

| Platform | Isolation |
|----------|-----------|
| Windows | Job Objects — entire process tree confined and killed atomically on session close |
| macOS | Seatbelt (SBPL) — deny-default sandbox via `sandbox-exec` |
| Linux | bubblewrap — `--unshare-pid --die-with-parent --unshare-net` user namespaces |

Agents also run **fully permissionless by default**. Tempest passes each agent's skip-permissions flag at spawn — no mid-run confirmation dialogs, no interruptions. Claude Code gets `--dangerously-skip-permissions`, Gemini CLI gets `--yolo`, Codex CLI gets `--dangerously-bypass-approvals-and-sandbox`.

Both behaviours are toggles in **Settings → Security**. You stay in control.

**Tempest is built using Tempest** — every feature in this repo was shipped by parallel agents running inside the app.


## What's next

**Database Branches** — per-project Docker-based DB isolation is shipping now. Each project gets its own branched database container so agents can migrate, break, and restore data without touching anything else.

See [ROADMAP.md](ROADMAP.md) for the full picture. **Star this repo** — we announce here first.

## Project

- [Roadmap](ROADMAP.md) — where Tempest is going and what's currently being built
- [Contributing](CONTRIBUTING.md) — setup, workflow, and how to send a PR
- [Code of Conduct](CODE_OF_CONDUCT.md) — how we behave in project spaces
- [Security policy](SECURITY.md) — reporting vulnerabilities (please do not open a public issue)
- [License](LICENSE) — Apache 2.0

## Build from source

Pre-built binaries are available for Windows, macOS, and Linux.

Prerequisites: Node.js 18+, Rust 1.77+. Windows also requires the [WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/).

```bash
git clone https://github.com/tempestai-dev/tempest
cd tempest
npm install
npm run dev
```

## Star History

[![Star Trail](https://star-trail.fun/api/chart/tempestai-dev/tempest)](https://star-trail.fun/tempestai-dev/tempest)

## Contributors

Thanks to everyone who has contributed to Tempest. See [CONTRIBUTING.md](CONTRIBUTING.md) to get started.

<a href="https://github.com/tempestai-dev/tempest/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=tempestai-dev/tempest" alt="Tempest contributors" />
</a>

## Community

[X (Twitter)](https://x.com/usetempest) — @usetempest

[GitHub](https://github.com/tempestai-dev/tempest)

[Instagram](https://instagram.com/usetempest)

[LinkedIn](https://linkedin.com/company/usetempest)

