# Contributing to Tempest

Thanks for your interest in contributing. This document covers how to get set up and what to expect when submitting changes.

## Repository layout

```
tempest-git/
├── src/              React frontend (Tauri app)
├── src-tauri/        Rust backend (Tauri app)
├── packages/atlas/   Token Intelligence — code graph MCP server
├── web/              Marketing website (Next.js)
└── docs/             Documentation (Mintlify)
```

## Prerequisites

- [Node.js](https://nodejs.org/) 20 or later
- [Rust](https://rustup.rs/) (stable)
- [Tauri CLI](https://tauri.app/start/prerequisites/) dependencies for your OS
- On Windows: WebView2 (ships with Windows 11; standalone installer available for Windows 10)

## Getting started

```bash
# Clone the repo
git clone https://github.com/tempestai-dev/tempest.git
cd tempest

# Install all workspace dependencies (app + web + docs)
npm install

# Build the atlas bundle (required before first dev run)
npm run setup

# Start the desktop app
npm run dev
```

## Running individual pieces

```bash
npm run dev          # Tauri desktop app
npm run dev:web      # Marketing website  (localhost:3000)
npm run dev:docs     # Documentation      (localhost:3001)
```

## Type checking

```bash
npx tsc --noEmit          # Frontend TypeScript
cargo check               # Rust backend
```

Both must pass clean before a PR is merged.

## Making changes

### Desktop app (src/ + src-tauri/)

- Frontend lives in `src/` — React 19, Vite, TypeScript
- Backend lives in `src-tauri/src/lib.rs` — Tauri commands, PTY, git operations
- CSS variables only — no hardcoded colors; all values go through `--tempest-*` vars
- No `React.StrictMode` — it double-invokes effects and breaks PTY spawning

### Atlas package (packages/atlas/)

- Run `npm run build:atlas` after any changes before testing in the app
- `tsc --noEmit` must pass inside `packages/atlas/`

### Website (web/)

```bash
npm run dev:web
npm run build:web
```

### Docs (docs/)

```bash
npm run dev:docs
npm run build:docs
```

## Submitting a pull request

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Run `npx tsc --noEmit` and `cargo check` — fix any errors
4. Open a PR against `main` with a clear description of what changed and why
5. Keep PRs focused — one thing per PR is easier to review and safer to merge

## Reporting bugs

Open an issue on GitHub. Include:
- OS and version
- Tempest version
- Steps to reproduce
- What you expected vs what happened

For security issues, email directly instead of opening a public issue.

## Commit style

Plain imperative subject line, no emoji, no period at the end:

```
fix: resolve atlas indexing in production builds
feat: add command palette
chore: update dependencies
```
