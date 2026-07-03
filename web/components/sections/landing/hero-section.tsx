"use client";

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import {
  ClaudeCode,
  Cline,
  Codex,
  GeminiCLI,
  Goose,
  OpenCode,
} from "@lobehub/icons";
import { Container } from "@/components/layout/container";
import { HeroButtons } from "@/components/hero-buttons";

// lobehub Combine components need an explicit flex row context (no global lobe stylesheet here)
const COMBINE_STYLE = {
  display: "flex",
  flexDirection: "row" as const,
  alignItems: "center",
};

type Agent = {
  label: string;
  logo: (size: number) => ReactNode;
};

const AGENT_GROUPS: Agent[][] = [
  [
    {
      label: "Claude Code",
      logo: (size) => (
        <ClaudeCode.Combine
          size={size}
          type="color"
          style={COMBINE_STYLE}
        />
      ),
    },
    {
      label: "Codex",
      logo: (size) => (
        <Codex.Combine
          size={size}
          type="color"
          style={COMBINE_STYLE}
        />
      ),
    },
  ],
  [
    {
      label: "Goose",
      logo: (size) => (
        <Goose.Combine
          size={size}
          style={COMBINE_STYLE}
        />
      ),
    },
    {
      label: "OpenCode",
      logo: (size) => (
        <OpenCode.Combine
          size={size}
          style={COMBINE_STYLE}
        />
      ),
    },
  ],
  [
    {
      label: "Gemini CLI",
      logo: (size) => (
        <GeminiCLI.Combine
          size={size}
          type="color"
          style={COMBINE_STYLE}
        />
      ),
    },
    {
      label: "Cline",
      logo: (size) => (
        <Cline.Combine
          size={size}
          style={COMBINE_STYLE}
        />
      ),
    },
  ],
];

function AgentLogo({
  agent,
  size = 28,
}: {
  agent: Agent;
  size?: number;
}) {
  return agent.logo(size);
}

function AgentPair({ agents }: { agents: Agent[] }) {
  return agents.map((agent, i) => (
    <span
      key={agent.label}
      className="inline-flex items-center gap-3"
    >
      {i > 0 && (
        <span className="text-foreground/40 font-light select-none">
          ,
        </span>
      )}
      <span className="inline-flex items-center">
        <AgentLogo agent={agent} size={26} />
      </span>
    </span>
  ));
}

export function HeroSection({ initialOS }: { initialOS?: string }) {
  const [groupIndex, setGroupIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);

      setTimeout(() => {
        setGroupIndex((i) => (i + 1) % AGENT_GROUPS.length);
        setVisible(true);
      }, 350);
    }, 2800);

    return () => clearInterval(interval);
  }, []);

  const currentGroup = AGENT_GROUPS[groupIndex];

  return (
    <>
      <Container>
        <section className="flex flex-col pt-10 pb-8 min-[1000px]:pb-16">
          <h1 className="text-3xl min-[1000px]:text-4xl font-normal leading-snug">
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>Run a fleet of</span>

              {/* sr-only: crawlable text listing all agents */}
              <span className="sr-only">Claude Code, Codex, Goose, OpenCode, Gemini CLI, Cline, and Aider</span>

              {/* Visual animation — hidden from crawlers and screen readers */}
              <span
                aria-hidden="true"
                className="inline-flex items-center gap-3 transition-all duration-300"
                style={{
                  opacity: visible ? 1 : 0,
                  transform: visible
                    ? "translateY(0px)"
                    : "translateY(6px)",
                }}
              >
                <AgentPair agents={currentGroup} />
              </span>
            </span>

            <span className="block text-muted-foreground mt-1">
              In parallel. Fully isolated. Token efficient.
            </span>
          </h1>

          <p className="mt-4 text-base text-muted-foreground max-w-xl leading-relaxed">
            The token-efficient, open-source way to run AI coding
            agents in parallel — up to 64% fewer tokens — and each
            agent gets its own git worktree and branch: zero merge
            conflicts, live status, built-in diff and PR.
          </p>

          <HeroButtons initialOS={initialOS} />
        </section>
      </Container>

      <Container className="mt-2 pb-12">
        <Image
          src="/screenshots/landing-light.png"
          alt="Tempest screenshot"
          width={1920}
          height={1080}
          priority
          quality={100}
          sizes="100vw"
          className="block dark:hidden w-full h-auto rounded-lg"
        />

        <Image
          src="/screenshots/landing-dark.png"
          alt="Tempest screenshot"
          width={1920}
          height={1080}
          priority
          quality={100}
          sizes="100vw"
          className="hidden dark:block w-full h-auto rounded-lg"
        />
      </Container>
    </>
  );
}