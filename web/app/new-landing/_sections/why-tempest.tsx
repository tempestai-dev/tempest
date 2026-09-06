import Image from "next/image";
import { Shield, Coins, Smartphone } from "lucide-react";
import { Container } from "../_components/container";
import { Aurora } from "../_components/aurora";

type Pillar = {
  icon: typeof Shield;
  title: string;
  body: string;
  image?: { src: string; alt: string; width: number; height: number };
};

const pillars: Pillar[] = [
  {
    icon: Shield,
    title: "Total isolation",
    body: "A git worktree per session keeps every agent on its own branch, and Hephaestus wraps each process in an OS-level sandbox — Job Objects on Windows, sandbox-exec on macOS, bubblewrap on Linux. Nothing escapes.",
    image: {
      src: "/new-landing/total-isolation.png",
      alt: "Parent repo shielded by Hephaestus, branching into isolated agent sandboxes",
      width: 1312,
      height: 1199,
    },
  },
  {
    icon: Coins,
    title: "Token intelligence",
    body: "A local code-knowledge graph lives on your machine and is shared across every session. Agents pull from it instead of scanning files on their own — up to 64% less context, up to 58% fewer tool calls.",
    image: {
      src: "/new-landing/token-intelligence.png",
      alt: "Shared code-knowledge graph feeding parallel agent sessions",
      width: 1536,
      height: 1024,
    },
  },
  {
    icon: Smartphone,
    title: "Continuity anywhere",
    body: "Kick off a session on your desktop and pick it up on your phone. The mobile app streams the same agents live, so you review, reply, and ship from wherever you are.",
    image: {
      src: "/new-landing/continuity-anywhere.png",
      alt: "Desktop and mobile sharing a single live agent session",
      width: 2000,
      height: 2000,
    },
  },
];

export function WhyTempestSection() {
  return (
    <Container className="mt-16 px-0 min-[476px]:px-0 min-[1000px]:px-0 border border-dashed border-muted-foreground/30">
      <div className="relative overflow-hidden">
        <Aurora
          className="absolute inset-0"
          colors={[
            "#000000",
            "#7c3aed",
            "#000000",
            "#d946ef",
            "#000000",
            "#f97316",
            "#000000",
          ]}
        />
        <div className="relative z-10 grid gap-8 px-6 pt-6 pb-10 sm:px-8 sm:pt-8 sm:pb-12 lg:px-10 lg:pt-10 lg:pb-16 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-end lg:gap-10">
          <div className="flex flex-col gap-5">
            <span className="text-[13px] uppercase tracking-[0.12em] text-white/60">
              Why Tempest
            </span>
            <h2 className="max-w-3xl font-pixel text-[28px] leading-[1.05] tracking-[-0.02em] sm:text-[34px] md:text-[40px]">
              <span className="text-white">More windows don&apos;t give you more isolation.</span>{" "}
              <span className="text-white/50">They give you more chaos.</span>
            </h2>
          </div>
          <p className="max-w-md text-[14px] font-light leading-[1.6] text-white/60 lg:pb-1">
            Shared knowledge base. Every agent on its own branch — nothing steps
            on anything else. Run five in parallel without confusion.
          </p>
        </div>
      </div>

      <div className="border-t border-dashed border-white/15">
        {pillars.map(({ icon: Icon, title, body, image }, i) => {
          const imageRight = i % 2 === 0;
          const imageBg = i === 2 ? "#080807" : "#030303";
          return (
            <div
              key={title}
              className={
                (i > 0 ? "border-t border-dashed border-white/15 " : "") +
                "grid grid-cols-1 min-[700px]:grid-cols-2"
              }
            >
              <div
                style={{ backgroundColor: imageBg }}
                className={
                  "relative aspect-[3/2] w-full overflow-hidden border-b border-dashed border-white/15 min-[700px]:border-b-0 " +
                  (imageRight
                    ? "min-[700px]:order-2 min-[700px]:border-l min-[700px]:border-dashed min-[700px]:border-white/15"
                    : "min-[700px]:border-r min-[700px]:border-dashed min-[700px]:border-white/15")
                }
              >
                <div className="absolute inset-0 flex items-center justify-center p-2 sm:p-3">
                  <div
                    className="relative h-full max-h-full max-w-full overflow-hidden"
                    style={{
                      aspectRatio: image
                        ? `${image.width} / ${image.height}`
                        : "1 / 1",
                    }}
                  >
                    {image ? (
                      <Image
                        src={image.src}
                        alt={image.alt}
                        fill
                        sizes="(min-width: 700px) 50vw, 100vw"
                        quality={100}
                        unoptimized
                        className="object-contain object-center"
                      />
                    ) : (
                      /* TODO: replace with real image/gif for this pillar */
                      <div className="absolute inset-0 flex items-center justify-center text-[11px] uppercase tracking-[0.14em] text-white/25">
                        image
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div
                className={
                  "flex flex-col justify-center gap-6 p-6 sm:p-8 lg:p-10 " +
                  (imageRight ? "min-[700px]:order-1" : "")
                }
              >
                <div className="flex h-10 w-10 items-center justify-center border border-dashed border-white/25 bg-white/[0.04]">
                  <Icon size={16} className="text-white" strokeWidth={1.5} />
                </div>
                <div className="flex flex-col gap-3">
                  <p className="font-pixel text-[24px] leading-[1.1] tracking-[-0.02em] text-white sm:text-[28px]">
                    {title}
                  </p>
                  <p className="max-w-md text-[14px] font-light leading-[1.6] text-white/60 sm:text-[15px]">
                    {body}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Container>
  );
}
