# Tempest Roadmap

This document describes where Tempest is going and why. It is a living record of intent, not a promise list. Priorities shift as we learn what engineers actually need. The direction does not. It also doubles as the on-ramp for contributors: each active area below names concrete, pick-up-able work.

## The direction

Parallel agent sessions are the foundation. Tempest is an engineering platform where multiple agents work on a codebase the way a team does — with isolation guarantees, shared context, and full tooling to review and ship their work. Every workstream below serves that: making each agent smarter and safer, and making the surface you orchestrate them from feel like one coherent space rather than a stack of terminals.

## Foundation (shipped)

**Threads — the canvas workspace.** The linear chat is gone. Every tab is now a spatial, node-based canvas where research, discussion, and agent-launching happen as **nodes** instead of one scrolling pane. Nodes come in four types: `chat`, `text`, `agent`, `terminal`. Thinking nodes carry no branch; execution nodes bind to a git branch and a real PTY session. The canvas shares ambient context (node types, titles, output summaries) without collapsing everything into one thread.

**Token Intelligence.** A local code-knowledge graph, built per project, that agents query directly instead of firing repeated file reads and blind searches. Benchmarked across 7 real-world projects (TypeScript, Python, Rust, Go, Java, Swift): up to 64% fewer tokens on large codebases and 58% fewer tool calls on average. Built in — no configuration, no separate service.

**Database Branches.** Every agent gets its own live, isolated Postgres connection — a real copy of your source database it can migrate, break, and reset without ever touching production or another agent's database. When the session ends, the branch is cleaned up. Real backend work, in parallel, with zero blast radius.

**Tempest Bridge.** Claude Code runs as a first-class chat backend inside canvas nodes via the Claude Agent SDK — no API key required if you already have the CLI installed. This is the pattern we'll extend to other CLI agents next.

## Now building

**Threads polish.** Threads shipped as an MVP: the model works, the surface doesn't yet feel finished. Node layout, selection, keyboard flow, canvas navigation, and the empty-state onboarding all need another pass. If you've used it and it felt rough somewhere specific, open an issue — that's the shortlist.

**Hephaestus hardening.** Hephaestus is the per-agent isolation layer (Job Objects on Windows, `sandbox-exec` on macOS, bubblewrap on Linux). It's live, but agents can still escape in cases we know about. Closing those holes and reaching parity across all three OSes is a priority — this is the guarantee the rest of the platform is built on, and it has to actually hold.

**Automations.** Currently in beta. The runtime works; the authoring surface, model routing, and failure-recovery story need to catch up before it graduates. Per-automation model overrides landed recently; scheduling, retries, and observability are next.

**More agents.** Bridge proved the pattern with Claude Code. We want the same first-class node experience for other CLI coding agents (Codex, Gemini CLI, and whatever comes next), plus additional API providers in BYOK chat nodes.

**Desktop notifications.** Long-running agents shouldn't require you to sit and watch them. Native OS notifications for agent completion, approval prompts, and errors — cross-platform.

**Keyboard-native everything.** Several surfaces today still require a mouse — canvas navigation, node selection and creation, workspace switching, and various menus. The goal is that every function in Tempest has a keyboard path, so a mouse is a preference, not a requirement. We plan to get to this soon ourselves, but if it's something you'd enjoy working on, we'd be very glad to have your help — please open an issue and we'll support you through it.

## On the roadmap

**Tasks tab — issues where the work happens.** A first-class tab that pulls issues from GitHub and Linear (Slack to follow) into Tempest itself, so you see what's on your plate without leaving the app. One click sends an agent to work on an issue in its own isolated branch — the same isolation and database-branch guarantees as any other agent session, tied back to the source ticket. GitHub and Linear are the priorities; Slack lands after.

**Mobile apps (iOS + Android).** Built with Expo. Not a mini IDE — a companion surface: check on agents, approve or redirect them mid-run, review diffs, get notified when something needs you. Backed by remote agents (below) so the desktop app can be closed.

**Remote agents.** Agents still execute locally on your machine — but the control plane is remote-accessible. Launch, monitor, and steer them from the mobile app, from another laptop, or from a script. Local-only execution keeps the isolation and cost story intact; remote control unlocks the "my agents are working, I'm not at my desk" use case.

**macOS + Linux.** The core architecture is cross-platform; macOS packaging and testing is in progress, Linux follows.

**Multi-agent coordination.** Agents aware of each other's work, not just isolated from it: shared task context, merge-ready handoffs, composable workflows without giving up the isolation guarantees.

**Richer node types.** Document, web, image, and diff nodes; @mention-a-node context; canvas-wide semantic search. The node model is meant to grow.

**Context / retrieval layer.** Semantic search across a canvas and RAG fallback when connected context overflows the model's window. Deliberately deferred until a real canvas hits that ceiling; Token Intelligence covers the common case today.

## Cloud & team layer

Tempest is local-first and stays that way. On top of that, we're planning an optional hosted layer for teams and organizations:

- **Sync & handoff** — pick up a canvas on another machine, or hand it to a teammate
- **Team workspaces** — shared canvases, shared context, shared automations
- **Enterprise controls** — audit logs, SSO, usage governance, centrally-managed policy
- **Managed remote agents** — for teams that don't want to run the control plane themselves

The local app remains fully functional without any of this. Cloud is additive.

## Feature requests welcome

If you want a node type, an agent integration, or a canvas capability that isn't here, open an issue. Requests that sharpen the orchestration surface are exactly what we're looking for.

## How this document works

Shipping order changes. This document reflects current priorities, not a fixed timeline. When something ships, it moves out of the "Now building" section. Star the repo to get notified when that happens.
