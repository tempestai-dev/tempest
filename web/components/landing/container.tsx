import { Container as BaseContainer } from "@/components/layout/container";
import { cn } from "@/lib/utils";

export function Container({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <BaseContainer className={cn("max-w-[1380px] min-[1000px]:px-8", className)}>
      {children}
    </BaseContainer>
  );
}
