import Image from "next/image";
import Link from "next/link";
import { Container } from "@/components/layout/container";

export function CtaSection() {
  return (
    <Container className="pb-0">
      <div className="rounded-2xl overflow-hidden bg-background">
        <div className="flex flex-col items-center text-center px-8 pt-16 pb-0 gap-6">
          <h2 className="text-3xl min-[1000px]:text-4xl font-normal text-foreground leading-snug max-w-xl">
            Cut context tokens up to 64%. Run every agent in parallel.{" "}
            <span>Download Tempest free.</span>
          </h2>
          <Link
            href="/download"
            className="bg-foreground text-background rounded-full px-5 h-[41px] flex items-center text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Download Tempest free
          </Link>
          <p className="text-xs text-muted-foreground">Runs entirely on your machine &mdash; your code never leaves it.</p>
        </div>
        <div className="relative overflow-hidden max-h-[520px]">
          <div className="absolute top-0 inset-x-0 h-24 bg-gradient-to-b from-background to-transparent z-10 pointer-events-none" />
          <Image
            src="/screenshots/cta-light.png"
            alt="Tempest running parallel AI coding agents"
            width={3840}
            height={2160}
            loading="eager"
            className="block dark:hidden w-full h-auto object-top"
          />
          <Image
            src="/screenshots/cta-dark.png"
            alt="Tempest running parallel AI coding agents"
            width={3840}
            height={2160}
            loading="eager"
            className="hidden dark:block w-full h-auto object-top"
          />
        </div>
      </div>
    </Container>
  );
}
