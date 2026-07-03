import { Claude, OpenAI, Gemini, DeepSeek, Mistral, Ollama } from "@lobehub/icons";
import { cn } from "@/lib/utils";

function TempestIconMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 437 460"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Tempest"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M23.7912 15.2372C62.8703 41.4128 117.205 79.5087 177.786 123.208C284.388 200.106 277.569 194.72 288.033 210.273C305.218 235.809 356.934 310.173 359.836 313.521C361.39 315.314 362.152 316.782 361.528 316.782C360.357 316.782 284.37 263.112 225.258 220.531C206.828 207.256 175.787 184.902 156.277 170.858L120.806 145.319L79.0199 95.6403C17.9253 23.0059 -1.07263 0 0.0462075 0C0.593524 0 11.2792 6.85741 23.7912 15.2372ZM173.931 202.674C222.493 234.896 279.04 273.076 299.59 287.514C351.991 324.329 423.811 376.127 427.789 379.973C431.16 383.23 436.488 400.003 436.529 407.481C436.559 412.954 428.372 422.347 422.61 423.45C417.574 424.414 416.682 423.134 420.045 419.768C423.206 416.604 420.851 412.603 412.079 406.244C406.615 402.282 390.787 396.187 360.651 386.439C336.707 378.693 316.864 372.64 316.559 372.987C316.252 373.334 326.686 392.903 339.747 416.476C352.808 440.048 363.232 459.629 362.913 459.988C362.593 460.346 352.434 452.371 340.336 442.262C328.237 432.153 311.907 418.647 304.045 412.248L289.752 400.616L265.735 354.919L241.72 309.222L161.815 228.652C117.87 184.336 79.3997 145.226 76.328 141.741L70.7431 135.404L78.1896 139.744C82.2852 142.131 125.369 170.449 173.931 202.674ZM173.384 281.741L220.175 295.217L240.655 330.689C251.918 350.199 260.859 366.465 260.522 366.832C259.78 367.645 261.531 368.869 188.025 316.13C126.823 272.219 121.718 268.358 124.797 268.3C125.784 268.281 147.649 274.33 173.384 281.741ZM393.734 369.925C393.734 370.566 395.946 374.869 398.651 379.487C403.424 387.639 406.015 389.467 416.362 391.97C425.237 394.116 420.583 387.255 406.658 377.662C399.55 372.765 393.734 369.284 393.734 369.925Z"
        fill="currentColor"
      />
    </svg>
  );
}

const IntegrationCard = ({
  children,
  className,
  borderClassName,
}: {
  children: React.ReactNode;
  className?: string;
  borderClassName?: string;
}) => {
  return (
    <div className={cn("bg-background relative flex size-20 rounded-xl dark:bg-transparent", className)}>
      <div
        role="presentation"
        className={cn("absolute inset-0 rounded-xl border border-black/20 dark:border-white/25", borderClassName)}
      />
      <div className="relative z-20 m-auto size-fit *:size-8">{children}</div>
    </div>
  );
};

export function AgentsIllustration() {
  return (
    <div className="dark:bg-muted/50 relative mx-auto w-fit">
      <div
        aria-hidden
        className="bg-radial to-muted dark:to-background absolute inset-0 z-10 from-transparent to-75%"
      />
      <div className="mx-auto mb-2 flex w-fit justify-center gap-2">
        <IntegrationCard>
          <Claude.Color />
        </IntegrationCard>
        <IntegrationCard>
          <OpenAI />
        </IntegrationCard>
      </div>
      <div className="mx-auto my-2 flex w-fit justify-center gap-2">
        <IntegrationCard>
          <Gemini.Color />
        </IntegrationCard>
        <IntegrationCard
          borderClassName="shadow-black-950/10 shadow-xl border-black/25 dark:border-white/25"
          className="dark:bg-white/10"
        >
          <TempestIconMark className="size-8" />
        </IntegrationCard>
        <IntegrationCard>
          <DeepSeek.Color />
        </IntegrationCard>
      </div>
      <div className="mx-auto flex w-fit justify-center gap-2">
        <IntegrationCard>
          <Mistral.Color />
        </IntegrationCard>
        <IntegrationCard>
          <Ollama />
        </IntegrationCard>
      </div>
    </div>
  );
}
