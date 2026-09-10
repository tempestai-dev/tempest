import Link from "next/link";
import { Check, X, ArrowUpRight } from "lucide-react";
import { Container } from "@/components/landing/container";
import { Aurora } from "@/components/landing/aurora";

type Cell = boolean | string;

type Row = {
  label: string;
  tempest: Cell;
  competitors: Cell[];
};

const competitors = [
  { name: "Orca", href: "/tempest-vs-orca" },
  { name: "Conductor", href: "/tempest-vs-conductor" },
  { name: "AgentsRoom", href: "/tempest-vs-agentsroom" },
  { name: "Emdash", href: "/tempest-vs-emdash" },
  { name: "Paseo", href: "/tempest-vs-paseo" },
  { name: "Superset", href: "/tempest-vs-superset" },
];

const rows: Row[] = [
  {
    label: "License",
    tempest: "Apache 2.0",
    competitors: ["MIT", "Proprietary", "Proprietary", "MIT", "MIT", "ELv2"],
  },
  {
    label: "Windows / macOS / Linux",
    tempest: "All three",
    competitors: ["All three", "macOS only", "All three", "macOS / Linux", "All three", "macOS only"],
  },
  {
    label: "Parallel git worktrees",
    tempest: true,
    competitors: [true, true, true, true, true, true],
  },
  {
    label: "Shared knowledge graph",
    tempest: "Up to 86% fewer tokens",
    competitors: [false, false, false, false, false, false],
  },
  {
    label: "Database branches per session",
    tempest: true,
    competitors: [false, false, false, false, false, false],
  },
  {
    label: "OS-level sandbox (Hephaestus)",
    tempest: true,
    competitors: [false, false, false, false, false, false],
  },
  {
    label: "Mobile companion",
    tempest: true,
    competitors: [true, false, false, false, false, false],
  },
  {
    label: "Any CLI agent",
    tempest: "Any CLI agent",
    competitors: ["Any CLI agent", "Claude, Codex, Cursor only", "Any CLI agent", "Any CLI agent", "Any CLI agent", "Any CLI agent"],
  },
  {
    label: "Price",
    tempest: "Open source",
    competitors: ["Free", "$20/mo+", "Tiered", "Free", "Free", "Free"],
  },
];

function CellContent({ value, highlight }: { value: Cell; highlight?: boolean }) {
  if (value === true) {
    return (
      <Check
        size={16}
        strokeWidth={2}
        className={highlight ? "text-emerald-400" : "text-white/70"}
      />
    );
  }
  if (value === false) {
    return <X size={16} strokeWidth={2.5} className="text-red-500" />;
  }
  return (
    <span
      className={
        "text-[13px] leading-[1.35] " +
        (highlight ? "text-white" : "text-white/55")
      }
    >
      {value}
    </span>
  );
}

export function CompareSection() {
  return (
    <Container className="mt-16 px-0 min-[476px]:px-0 min-[1000px]:px-0 border border-dashed border-muted-foreground/30">
      <div className="relative overflow-hidden">
        <Aurora
          className="absolute inset-0"
          colors={[
            "#000000",
            "#f43f5e",
            "#000000",
            "#f59e0b",
            "#000000",
            "#fb923c",
            "#000000",
          ]}
        />
        <div className="relative z-10 grid gap-8 px-6 pt-6 pb-10 sm:px-8 sm:pt-8 sm:pb-12 lg:px-10 lg:pt-10 lg:pb-16 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-end lg:gap-10">
          <div className="flex flex-col gap-5">
            <span className="text-[13px] uppercase tracking-[0.12em] text-white/60">
              How Tempest compares
            </span>
            <h2 className="max-w-3xl font-pixel text-[28px] leading-[1.05] tracking-[-0.02em] sm:text-[34px] md:text-[40px]">
              <span className="text-white">Six alternatives.</span>{" "}
              <span className="text-white/50">One actually cares about token costs.</span>
            </h2>
          </div>
          <p className="max-w-md text-[14px] font-light leading-[1.6] text-white/60 lg:pb-1">
            Everyone else runs agents. Tempest is built for agentic engineering
            at scale — shared knowledge graph, database branches, OS-level sandbox.
          </p>
        </div>
      </div>

      <div className="border-t border-dashed border-white/15 overflow-x-auto">
        <div
          className="grid min-w-[900px]"
          style={{
            gridTemplateColumns: `minmax(180px, 1.6fr) minmax(110px, 1fr) repeat(${competitors.length}, minmax(110px, 1fr))`,
          }}
        >
          {/* Header row */}
          <div className="border-b border-dashed border-white/15 p-4 sm:p-5 text-[12px] uppercase tracking-[0.14em] text-white/40">
            Capability
          </div>
          <div className="border-b border-l border-dashed border-white/15 bg-white/[0.03] p-4 sm:p-5">
            <span className="font-pixel text-[17px] tracking-[-0.01em] text-white">
              Tempest
            </span>
          </div>
          {competitors.map((c) => (
            <Link
              key={c.name}
              href={c.href}
              className="group flex items-center gap-1.5 border-b border-l border-dashed border-white/15 p-4 sm:p-5"
            >
              <span className="font-pixel text-[17px] tracking-[-0.01em] text-white/70 group-hover:text-white">
                {c.name}
              </span>
              <ArrowUpRight
                size={12}
                strokeWidth={2}
                className="text-white/30 transition-colors group-hover:text-white/70"
              />
            </Link>
          ))}

          {/* Data rows */}
          {rows.map((row, ri) => {
            const isLast = ri === rows.length - 1;
            const borderB = isLast ? "" : "border-b border-dashed border-white/15";
            return (
              <div key={row.label} className="contents">
                <div
                  className={
                    "flex items-center p-4 sm:p-5 text-[14px] leading-[1.4] text-white/80 " +
                    borderB
                  }
                >
                  {row.label}
                </div>
                <div
                  className={
                    "flex items-center border-l border-dashed border-white/15 bg-white/[0.03] p-4 sm:p-5 " +
                    borderB
                  }
                >
                  <CellContent value={row.tempest} highlight />
                </div>
                {row.competitors.map((cell, ci) => (
                  <div
                    key={ci}
                    className={
                      "flex items-center border-l border-dashed border-white/15 p-4 sm:p-5 " +
                      borderB
                    }
                  >
                    <CellContent value={cell} />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </Container>
  );
}
