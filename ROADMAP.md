# Tempest Roadmap

This document describes where Tempest is going and why. It is a living record of intent, not a promise list. Priorities shift as we learn what engineers actually need. The direction does not.

## The direction

Parallel agent sessions are the foundation. Tempest is being built into an engineering platform where multiple agents work on a codebase the way a team does — with isolation guarantees, shared context, and full tooling to review and ship their work. The near-term work is about making each agent smarter and safer without adding friction to the workflow that already exists.

## In active development

### Token Intelligence

The problem: agents spend most of their context budget reading files they have already read and searching for code they cannot find reliably. On large codebases this compounds fast — context fills with noise, turns slow down, and costs climb.

The solution is a local code-knowledge graph built per project. When an agent needs to understand your codebase, it queries the graph directly instead of firing repeated file reads and blind searches. The graph knows your structure, symbols, and relationships without the agent having to rediscover them on every turn.

Benchmarked across 7 real-world projects in TypeScript, Python, Rust, Go, Java, and Swift: up to 64% fewer tokens on large codebases and 58% fewer tool calls on average. Fewer tokens means faster turns, lower costs, and agents that stay useful further into a session — on the work you are already doing, without changing how you work.

Token Intelligence ships as a built-in capability. No configuration, no separate service.

### Database Branches

The problem: agents doing real backend work need a real database, but giving multiple parallel agents access to the same database is dangerous. One agent's migration breaks another agent's session. A delete cascades where it should not. Running against production is never an option.

The solution: every agent gets its own live Postgres connection — a real, isolated copy of your source database. The agent writes to it, runs migrations, breaks it, deletes rows, starts over. None of that ever touches production. None of it touches another agent's database. When the session ends, the branch is cleaned up.

Real database work, in parallel, with zero blast radius.

## On the roadmap

**macOS support**
The core architecture is cross-platform. macOS packaging and testing is in progress. Linux follows.

**Multi-agent coordination**
Agents that are aware of each other's work, not just isolated from it. Shared task context, merge-ready handoffs, and the ability to compose agents into workflows without giving up the isolation guarantees that make parallel work safe.

**Enterprise controls**
Audit logs, SSO, team workspaces, usage governance. Tempest is being built to run in environments where those things are not optional — deployed inside an organization, managed centrally, with full visibility into what agents are doing and at what cost.

## How this document works

Shipping order changes. This document reflects current priorities, not a fixed timeline. When something ships, it moves out of this file and into the changelog. Star the repo to get notified when that happens.
