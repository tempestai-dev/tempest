import { useEffect, useRef } from "react";
import { UiIcon } from "../icons/UiIcon";
const Columns2 = (p: any) => <UiIcon name="columns-2" {...p} />;
const Rows2 = (p: any) => <UiIcon name="rows-2" {...p} />;
const ListOrdered = (p: any) => <UiIcon name="list-ordered" {...p} />;
const Megaphone = (p: any) => <UiIcon name="megaphone" {...p} />;

interface Props {
  open: boolean;
  onSplitV?: () => void;
  onSplitH?: () => void;
  onQueue?: () => void;
  onBroadcast?: () => void;
}

export default function IconCapsule({ open, onSplitV, onSplitH, onQueue, onBroadcast }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open) {
      el.classList.add("animating");
      el.offsetWidth; // force reflow so CSS transition fires
      el.classList.add("open");
    } else {
      el.classList.remove("open");
      const onEnd = () => {
        el.removeEventListener("transitionend", onEnd);
        if (!el.classList.contains("open")) el.classList.remove("animating");
      };
      el.addEventListener("transitionend", onEnd);
    }
  }, [open]);

  return (
    <div className="icon-capsule" ref={ref}>
      <button className="capsule-btn" onClick={onSplitV} title="Split vertically"><Columns2 /></button>
      <div className="sep" />
      <button className="capsule-btn" onClick={onSplitH} title="Split horizontally"><Rows2 /></button>
      <div className="sep" />
      <button className="capsule-btn" onClick={onQueue} title="Message queue"><ListOrdered /></button>
      <div className="sep" />
      <button className="capsule-btn" onClick={onBroadcast} title="Broadcast"><Megaphone /></button>
    </div>
  );
}
