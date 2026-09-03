import Link from "next/link";
import Image from "next/image";
import { Download } from "lucide-react";
import { Container } from "../_components/container";
import { Button } from "../_components/button";

export function ScreenshotSection() {
  return (
    <Container className="mt-16 px-0 min-[476px]:px-0 min-[1000px]:px-0 border border-dashed border-muted-foreground/30 min-h-screen">
      <div className="relative w-full">
        <div className="relative z-10 p-6 sm:p-8">
          <h2 className="font-pixel text-[28px] leading-[1.05] tracking-[-0.02em] sm:text-[34px]">
            <span className="text-white">One place</span>{" "}
            <span className="text-white/50">for every agent, in parallel.</span>
          </h2>
          <Button asChild compact mono className="mt-4">
            <Link href="/download">
              Download Now
              <Download data-icon="inline-end" />
            </Link>
          </Button>
          <div className="mt-6 relative aspect-[16/9] w-full overflow-hidden border border-white/20">
            <Image
              src="/screenshots/landing-dark.png"
              alt="Tempest workspace"
              fill
              sizes="(min-width: 1000px) 1280px, 100vw"
              className="object-cover object-top"
              priority={false}
            />
          </div>
        </div>
      </div>
    </Container>
  );
}
