/**
 * @file Modal.tsx
 * Shared modal primitive over the native <dialog>.showModal().
 * The platform provides: top-layer rendering (above any z-index), inert
 * background (clicks, Tab and focus cannot reach the page), Esc handling
 * via the `cancel` event, and a focus trap.
 *
 * What this wrapper adds — the parts the platform does NOT give us:
 * - DOM → React sync: every close path (Esc, forced close) fires `close`,
 *   which calls onClose, so React state never desyncs from the dialog.
 * - Focus on close: the browser restores focus to the element focused
 *   before opening (e.g. the checkbox that triggered a confirm), which
 *   resurrects its focus ring — we move focus to #task-list instead.
 * - Backdrop click dismisses only if the press started on the backdrop,
 *   so a drag from inside the panel to outside does not close it.
 * - dismissible={false} suppresses Esc; the browser may still force-close
 *   after repeated Esc, which the `close` sync handles gracefully.
 *
 * Contract for nested popovers (Combobox, DatePicker, …): a component that
 * consumes Escape must call e.preventDefault() on the keydown, otherwise
 * the dialog treats it as a close request — stopPropagation() is not
 * enough, `cancel` is not driven by event bubbling.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { useApp } from "./AppContext.jsx";

interface ModalProps {
  /** Called on any close: Esc, backdrop click, or a forced close. */
  onClose: () => void;
  /** false = Esc and backdrop clicks do not close (e.g. progress overlays). */
  dismissible?: boolean;
  /** Panel size/padding classes; surface, border and shadow are built-in. */
  className?: string;
  children: ReactNode;
}

export function Modal({ onClose, dismissible = true, className = "", children }: ModalProps) {
  const { TC } = useApp();
  const ref = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dismissibleRef = useRef(dismissible);
  dismissibleRef.current = dismissible;
  const pressOnBackdrop = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!el.open) el.showModal();

    const handleCancel = (e: Event) => { if (!dismissibleRef.current) e.preventDefault(); };
    const handleClose = () => {
      document.getElementById("task-list")?.focus();
      onCloseRef.current();
    };
    el.addEventListener("cancel", handleCancel);
    el.addEventListener("close", handleClose);
    return () => {
      el.removeEventListener("cancel", handleCancel);
      el.removeEventListener("close", handleClose);
      // Unmounted while open (state-driven close): shut the dialog without
      // re-firing onClose, and keep the browser from handing focus back to
      // the element that opened us.
      if (el.open) el.close();
      document.getElementById("task-list")?.focus();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className="m-auto bg-transparent p-0 outline-none"
      onMouseDown={e => { pressOnBackdrop.current = e.target === ref.current; }}
      onClick={e => {
        const onBackdrop = pressOnBackdrop.current && e.target === ref.current;
        pressOnBackdrop.current = false;
        if (onBackdrop && dismissibleRef.current) ref.current?.close();
      }}
    >
      <div className={`border rounded-xl shadow-2xl ${TC.surface} ${TC.borderClass} ${className}`}>
        {children}
      </div>
    </dialog>
  );
}
