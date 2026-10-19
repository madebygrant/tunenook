import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useCloseOnBack } from "../lib/history";

const FOCUSABLE = "button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex='-1'])";

// Open dialogs, innermost last. Only the innermost takes keys, and everything under it is inert.
const stack: HTMLElement[] = [];

interface Props {
  label: string;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}

// Rendered outside .app so the whole app can go inert while it is open.
export function Dialog({ label, onClose, className, children }: Props) {
  const layer = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const close = useCloseOnBack(onClose);

  useEffect(() => {
    const app = document.querySelector<HTMLElement>(".app");
    const self = layer.current!;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (app) app.inert = true;
    stack.at(-1)?.setAttribute("inert", "");
    stack.push(self);
    const first = box.current?.querySelector<HTMLElement>("[data-autofocus]");
    (first ?? box.current)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (stack.at(-1) !== self) return;
      if (e.key === "Escape") return close.current();
      if (e.key !== "Tab" || !box.current) return;
      const items = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return e.preventDefault();
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      stack.splice(stack.indexOf(self), 1);
      const top = stack.at(-1);
      if (top) top.removeAttribute("inert");
      else if (app) app.inert = false;
      opener?.focus();
    };
  }, [close]);

  return createPortal(
    <div ref={layer} className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} className={`dialog${className ? ` ${className}` : ""}`} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
