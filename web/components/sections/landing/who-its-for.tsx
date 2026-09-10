import Image from "next/image";
import { Container } from "@/components/landing/container";
import { Aurora } from "@/components/landing/aurora";

type Persona = {
  image: string;
  title: string;
  body: string;
  chips: string[];
};

const personas: Persona[] = [
  {
    image: "/personas/solo-builders.webp",
    title: "Solo developers",
    body: "You run three agents on a side project after dinner. You want fewer merge conflicts, a lower API bill, and one window instead of nine.",
    chips: ["Open source", "Local-first", "Apache 2.0"],
  },
  {
    image: "/personas/students.webp",
    title: "Startup teams",
    body: "You are shipping five features a week with a team of four. Every dev runs parallel agents. Token spend is a real line item.",
    chips: ["Shared graph", "DB branches", "One binary"],
  },
  {
    image: "/personas/freelancers.webp",
    title: "Agencies & consultancies",
    body: "You touch a dozen client repos a month. You need isolation you can trust, on Windows and macOS, without a per-seat subscription eating your margin.",
    chips: ["Apache 2.0", "Cross-platform", "No per-seat cost"],
  },
  {
    image: "/personas/enterprise.webp",
    title: "Enterprise",
    body: "Your code cannot leave the machine, your agents cannot corrupt each other, and your compliance team has already said no to cloud. Tempest is on-machine and sandboxed.",
    chips: ["Hephaestus sandbox", "Self-hosted", "Audit-friendly"],
  },
];

export function WhoItsForSection() {
  return (
    <Container className="mt-16 px-0 min-[476px]:px-0 min-[1000px]:px-0 border border-dashed border-muted-foreground/30">
      <div className="relative overflow-hidden">
        <Aurora
          className="absolute inset-0"
          colors={[
            "#000000",
            "#eab308",
            "#000000",
            "#f59e0b",
            "#000000",
            "#facc15",
            "#000000",
          ]}
        />
        <div className="relative z-10 grid gap-8 px-6 pt-6 pb-10 sm:px-8 sm:pt-8 sm:pb-12 lg:px-10 lg:pt-10 lg:pb-16 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-end lg:gap-10">
          <div className="flex flex-col gap-5">
            <span className="text-[13px] uppercase tracking-[0.12em] text-white/60">
              Who it&apos;s for
            </span>
            <h2 className="max-w-3xl font-pixel text-[28px] leading-[1.05] tracking-[-0.02em] sm:text-[34px] md:text-[40px]">
              <span className="text-white">Same problem.</span>{" "}
              <span className="text-white/50">Four different budgets for it.</span>
            </h2>
          </div>
          <p className="max-w-md text-[14px] font-light leading-[1.6] text-white/60 lg:pb-1">
            One binary, one price (zero), four shapes of team. If you run agents
            more than once a week, Tempest is built for you.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 border-t border-dashed border-white/15 sm:grid-cols-2 lg:grid-cols-4">
        {personas.map(({ image, title, body, chips }, i) => {
          const smCol = i % 2;
          const lgCol = i % 4;
          return (
            <div
              key={title}
              className={[
                "flex flex-col border-dashed border-white/15",
                i > 0 && "border-t",
                i < 2 && "sm:border-t-0",
                smCol > 0 && "sm:border-l",
                i < 4 ? "lg:border-t-0" : "lg:border-t",
                lgCol > 0 ? "lg:border-l" : "lg:border-l-0",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <div className="relative aspect-[4/5] w-full overflow-hidden bg-white/[0.04]">
                <Image
                  src={image}
                  alt={title}
                  fill
                  sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
              </div>
              <div className="flex flex-col p-6 sm:p-8">
                <p className="font-pixel text-[20px] leading-[1.1] tracking-[-0.02em] text-white">
                  {title}
                </p>
                <p className="mt-3 text-[13px] font-light leading-[1.6] text-white/60">
                  {body}
                </p>
                <div className="mt-5 flex flex-wrap gap-1.5">
                  {chips.map((c) => (
                    <span
                      key={c}
                      className="border border-dashed border-white/20 bg-white/[0.03] px-2 py-1 text-[11px] uppercase tracking-[0.1em] text-white/60"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Container>
  );
}
