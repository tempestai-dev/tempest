import { cn } from "@/lib/utils";

export function Container({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "w-full max-w-[1440px] mx-auto px-6 min-[476px]:px-10 min-[1000px]:px-16",
        className
      )}
    >
      {children}
    </div>
  );
}
