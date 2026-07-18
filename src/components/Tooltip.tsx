import { ReactNode, useRef, useState, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import "./Tooltip.css";

type Placement = "top" | "bottom" | "left" | "right";

interface TooltipProps {
  content: string;
  placement?: Placement;
  children: ReactNode;
  className?: string;
}

function tipStyle(rect: DOMRect, p: Placement): React.CSSProperties {
  const gap = 7;
  switch (p) {
    case "top":    return { bottom: window.innerHeight - rect.top + gap,   left:  rect.left + rect.width  / 2, transform: "translateX(-50%)", opacity: 0 };
    case "bottom": return { top:    rect.bottom + gap,                      left:  rect.left + rect.width  / 2, transform: "translateX(-50%)", opacity: 0 };
    case "left":   return { right:  window.innerWidth  - rect.left + gap,  top:   rect.top  + rect.height / 2, transform: "translateY(-50%)", opacity: 0 };
    case "right":  return { left:   rect.right + gap,                       top:   rect.top  + rect.height / 2, transform: "translateY(-50%)", opacity: 0 };
  }
}

function Tip({ content, placement, triggerRect }: { content: string; placement: Placement; triggerRect: DOMRect }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const t = el.getBoundingClientRect();
    const pad = 8;
    let left = t.left;
    let top  = t.top;
    if (t.right  > window.innerWidth  - pad) left = window.innerWidth  - pad - t.width;
    if (t.left   < pad)                      left = pad;
    if (t.bottom > window.innerHeight - pad) top  = window.innerHeight - pad - t.height;
    if (t.top    < pad)                      top  = pad;
    el.style.left      = `${left}px`;
    el.style.top       = `${top}px`;
    el.style.right     = "";
    el.style.bottom    = "";
    el.style.transform = "none";
    el.style.opacity   = "1";
  }, [triggerRect]);

  return (
    <div
      ref={ref}
      className="tt-tip"
      role="tooltip"
      data-placement={placement}
      style={{ position: "fixed", ...tipStyle(triggerRect, placement) }}
    >
      {content}
    </div>
  );
}

export function Tooltip({ content, placement = "top", children, className }: TooltipProps) {
  if (!content) return <>{children}</>;

  const ref   = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const show = useCallback(() => {
    timer.current = setTimeout(() => {
      if (ref.current) setRect(ref.current.getBoundingClientRect());
    }, 420);
  }, []);

  const hide = useCallback(() => {
    clearTimeout(timer.current);
    setRect(null);
  }, []);

  return (
    <div ref={ref} className={`tt${className ? ` ${className}` : ""}`} onMouseEnter={show} onMouseLeave={hide}>
      {children}
      {rect && createPortal(<Tip content={content} placement={placement} triggerRect={rect} />, document.body)}
    </div>
  );
}
