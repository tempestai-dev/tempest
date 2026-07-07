import { ReactNode } from "react";
import "./Tooltip.css";

type Placement = "top" | "bottom" | "left" | "right";

interface TooltipProps {
  content: string;
  placement?: Placement;
  children: ReactNode;
  className?: string;
}

export function Tooltip({ content, placement = "top", children, className }: TooltipProps) {
  if (!content) return <>{children}</>;
  return (
    <div className={`tt${className ? ` ${className}` : ""}`} data-placement={placement}>
      {children}
      <div className="tt-tip" role="tooltip">{content}</div>
    </div>
  );
}
