"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { CheckIcon, CloseIcon } from "./icons";

interface Toast {
  id: string;
  message: string;
  type?: "info" | "success" | "warning";
  /** Shows an Undo button that runs this. */
  onUndo?: () => void;
  duration?: number;
}

interface ToastContextValue {
  showToast: (toast: Omit<Toast, "id">) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((toastData: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).slice(2);
    const newToast: Toast = { ...toastData, id };
    setToasts((prev) => [...prev, newToast]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-container" aria-live="polite">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onExpire={removeToast}>
            <span className="toast-message">
              {t.type === "success" && <CheckIcon size={14} style={{ marginRight: "0.4rem", color: "var(--success)" }} />}
              {t.message}
            </span>
            <div className="toast-actions">
              {t.onUndo && (
                <button
                  type="button"
                  className="toast-action-btn"
                  onClick={() => {
                    t.onUndo?.();
                    removeToast(t.id);
                  }}
                >
                  Undo
                </button>
              )}
              <button
                type="button"
                className="toast-close-btn"
                onClick={() => removeToast(t.id)}
                aria-label="Dismiss notification"
              >
                <CloseIcon size={13} />
              </button>
            </div>
          </ToastItem>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const LINGER = 1500; // after the pointer or focus leaves, a nearly expired toast still stays this long

/** Counts down its toast's time, paused while the mouse is over it or focus is inside it. */
function ToastItem({ toast, onExpire, children }: { toast: Toast; onExpire: (id: string) => void; children: React.ReactNode }) {
  const left = useRef(toast.duration ?? 5000);
  const since = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const held = useRef({ hover: false, focus: false });

  const sync = useCallback(() => {
    const hold = held.current.hover || held.current.focus;
    if (hold && timer.current !== undefined) {
      clearTimeout(timer.current);
      timer.current = undefined;
      left.current = Math.max(left.current - (Date.now() - since.current), LINGER);
    } else if (!hold && timer.current === undefined) {
      since.current = Date.now();
      timer.current = setTimeout(() => onExpire(toast.id), left.current);
    }
  }, [onExpire, toast.id]);

  useEffect(() => {
    sync();
    return () => {
      clearTimeout(timer.current);
      timer.current = undefined;
    };
  }, [sync]);

  const set = (key: "hover" | "focus", on: boolean) => {
    held.current[key] = on;
    sync();
  };

  return (
    <div
      className="toast-item"
      // Mouse only: a tap on a touch screen fires pointerenter but no leave, which would pin the toast.
      onPointerEnter={(e) => e.pointerType === "mouse" && set("hover", true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && set("hover", false)}
      onFocus={() => set("focus", true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && set("focus", false)}
    >
      {children}
    </div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      showToast: () => {},
    };
  }
  return context;
}

/** What an Undo write answers: a server action's `{ success }`, a plain yes or no, or nothing when it threw. */
type Written = boolean | { success?: boolean } | null | undefined;

/**
 * An Undo that writes the old state back. The screen goes back first inside `write`, which puts it right again when the
 * write fails; a write that throws or does not answer success shows `failed` (or what it returns for the answer) as a warning.
 * A `write` that has already told the user why it did nothing returns `true`.
 */
export function undoWith<R extends Written>(
  showToast: ToastContextValue["showToast"],
  write: () => Promise<R>,
  failed: string | ((back: Exclude<R, true> | null) => string) = "Failed to undo",
) {
  return async () => {
    const back = await write().catch(() => null);
    if (back === true || (back && typeof back === "object" && back.success)) return;
    showToast({ message: typeof failed === "function" ? failed(back as Exclude<R, true> | null) : failed, type: "warning" });
  };
}
