export type QA = { q: string; a: string };

export const faqs: QA[] = [
  {
    q: "Is Tempest actually free?",
    a: "Yes. Apache 2.0, open source. The only cost is the model API you already have — and Token Intelligence cuts that by up to 86%.",
  },
  {
    q: "Which agents does it support?",
    a: "Any CLI agent. Claude Code, Codex, Gemini, Aider, Cline, opencode — if it runs in a terminal, it runs in Tempest. MCP config files are written automatically for the common ones.",
  },
  {
    q: "Does my code leave my machine?",
    a: "No. Tempest is local-first by architecture, not policy. The knowledge graph, worktrees, agent sessions, and Postgres branches all live on your disk. There is no cloud sync path.",
  },
  {
    q: "How is this different from just opening five terminals?",
    a: "Five terminals give you five copies of the same repo state and five independent context loads. Tempest gives each agent its own git worktree (no collisions), a shared code-knowledge graph (86% fewer tokens), an isolated Postgres branch (no DB corruption), and an OS-level sandbox (no runaway commands).",
  },
  {
    q: "Windows / macOS / Linux?",
    a: "All three. Native Tauri app — no Electron, no daemon. macOS and Windows have installers; Linux is build-from-source today with packages coming.",
  },
  {
    q: "Can I use my own API keys?",
    a: "Yes. Tempest uses your existing agent CLI installations, so whatever keys you already configured — Anthropic, OpenAI, Google — just work. Nothing goes through us.",
  },
];
