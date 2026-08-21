# Contributing to Tempest

Thanks for your interest in contributing. Tempest is an open, early-stage project — bug reports, small fixes, and larger contributions are all welcome. This guide covers how to get set up, how the repo is organised, and what to expect when you open a pull request.

## Table of contents

- [Ways to contribute](#ways-to-contribute)
- [Repository layout](#repository-layout)
- [Prerequisites](#prerequisites)
- [Getting started](#getting-started)
- [Running individual pieces](#running-individual-pieces)
- [Type checking](#type-checking)
- [Testing](#testing)
- [Making changes](#making-changes)
- [Submitting a pull request](#submitting-a-pull-request)
- [Reporting bugs](#reporting-bugs)
- [Security issues](#security-issues)
- [Commit style](#commit-style)
- [License](#license)

## Ways to contribute

- **File a bug** — use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.yml)
- **Suggest a feature** — use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.yml), or check [ROADMAP.md](ROADMAP.md) for open workstreams
- **Send a pull request** — small fixes need no discussion; for larger changes, open an issue first so we can align on approach
- **Improve docs** — the marketing site (`web/`) and Mintlify docs (`docs/`) are in this same repo
- **Report a vulnerability** — see [SECURITY.md](SECURITY.md); do not open a public issue for security problems

If you want to work on something bigger, the **Tempest Bridge** workstream on the roadmap is the front door for collaboration.

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
- Windows only: WebView2 (ships with Windows 11; standalone installer available for Windows 10)

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

Both must pass clean before a PR can be merged:

```bash
npx tsc --noEmit          # Frontend TypeScript
cargo check               # Rust backend
```

Please run these locally rather than relying on CI to catch issues.

## Testing

Tempest follows a "tests grow with the code" policy:

- **When adding major new functionality, add tests that exercise it.** Rust code lives under `src-tauri/src/` — use `#[cfg(test)]` modules for unit tests and `src-tauri/tests/` for integration tests (`cargo test`). TypeScript code under `src/` and `packages/atlas/` uses Vitest where tests exist; new suites should follow the same setup.
- **When fixing a bug, add a regression test** that fails before the fix and passes after, whenever the surface is testable.
- **Reviewers will ask for tests** on PRs that add non-trivial logic. Trivial changes (docs, small refactors, UI copy) do not need tests.
- **Run the relevant suite before pushing:** `cargo test` for Rust changes, `npm test` (per-package) for TypeScript changes.

We do not require 100% coverage, and some surfaces (Tauri window management, native OS integration) are exercised through manual QA rather than automation. Use judgment: if the code has branches, edge cases, or handles untrusted input, it should have tests.

## Making changes

### Desktop app (`src/` + `src-tauri/`)

- Frontend: React 19, Vite, TypeScript — lives in `src/`
- Backend: Tauri commands, PTY, git operations — lives in `src-tauri/src/lib.rs`
- **CSS variables only** — no hardcoded colours; all values go through `--tempest-*` vars so themes work
- **No `React.StrictMode`** — it double-invokes effects and breaks PTY spawning

### Atlas package (`packages/atlas/`)

- Run `npm run build:atlas` after any changes before testing in the app
- `tsc --noEmit` must pass inside `packages/atlas/`

### Website (`web/`)

```bash
npm run dev:web
npm run build:web
```

### Docs (`docs/`)

```bash
npm run dev:docs
npm run build:docs
```

## Submitting a pull request

1. Fork the repo and create a branch from `main`
2. Make your changes — keep the PR focused on one thing
3. Run `npx tsc --noEmit` and `cargo check` — fix any errors
4. Push and open a PR against `main`; the [PR template](.github/PULL_REQUEST_TEMPLATE.md) will guide you
5. Link the issue you're closing, and note anything a reviewer should test manually
6. Be responsive to review feedback — small, iterative rounds land faster than one giant push

We aim to give an initial response within a few days. If a PR goes quiet for longer, feel free to ping.

## Reporting bugs

Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.yml). Include:

- OS and version
- Tempest version
- Steps to reproduce
- What you expected vs what happened
- Logs or screenshots if you have them (redact anything sensitive)

## Security issues

**Do not open a public issue.** Email **[gsvprharsha@tempestai.dev](mailto:gsvprharsha@tempestai.dev)** — full policy in [SECURITY.md](SECURITY.md).

## Commit style

Plain imperative subject line, no emoji, no period at the end. A conventional prefix is helpful but not required.

```
fix: resolve atlas indexing in production builds
feat: add command palette
chore: update dependencies
docs: clarify Hephaestus scope in README
```

## License

By contributing, you agree that your contributions will be licensed under the [Apache 2.0 License](LICENSE) that covers the project.
