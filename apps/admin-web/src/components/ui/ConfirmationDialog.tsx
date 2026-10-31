"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { Button, type ButtonVariant } from "./Button";

export interface ConfirmationDialogProps {
  triggerLabel: string;
  triggerVariant?: ButtonVariant;
  title: string;
  description: string;
  confirmLabel: string;
  busyLabel?: string;
  cancelLabel?: string;
  variant?: "primary" | "danger";
  errorMessage?: string;
  onConfirm: () => Promise<void> | void;
  children?: ReactNode;
}

/** Uses native modal focus containment; cancellation never invokes the action. */
export function ConfirmationDialog({
  triggerLabel, triggerVariant = "secondary", title, description, confirmLabel,
  busyLabel = "Working…", cancelLabel = "Cancel", variant = "primary",
  errorMessage = "This action could not be completed. Please try again.", onConfirm, children,
}: ConfirmationDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const confirming = useRef(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const id = useId();

  async function confirm() {
    if (confirming.current) return;
    confirming.current = true;
    setBusy(true);
    setFailed(false);
    try {
      await onConfirm();
      dialog.current?.close();
    } catch {
      setFailed(true);
    } finally {
      confirming.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <Button ref={trigger} variant={triggerVariant} onClick={() => { setFailed(false); dialog.current?.showModal(); }}>{triggerLabel}</Button>
      <dialog
        ref={dialog}
        className="confirmation-dialog"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        aria-busy={busy}
        onCancel={event => { if (confirming.current) event.preventDefault(); }}
        onClose={() => { setFailed(false); trigger.current?.focus(); }}
      >
        <div className="dialog-content">
          <h2 id={`${id}-title`}>{title}</h2>
          <p id={`${id}-description`}>{description}</p>
          {children && <div className="dialog-body">{children}</div>}
          {failed && <p className="field-error" role="alert">{errorMessage}</p>}
          <div className="dialog-actions">
            <Button variant="secondary" autoFocus disabled={busy} onClick={() => dialog.current?.close()}>{cancelLabel}</Button>
            <Button variant={variant} disabled={busy} onClick={confirm}>{busy ? busyLabel : confirmLabel}</Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
