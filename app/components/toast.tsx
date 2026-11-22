"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { CheckIcon, CloseIcon } from "./icons";

/** What an Undo is handed: the rows its toast touches, which a Retry of a failed restore keeps. */
type UndoFrom = { touches?: string[] };

interface Toast {
  id: string;
  message: string;
  type?: "success" | "warning";
  /** Shows an Undo button that runs this. */
  onUndo?: (from: UndoFrom) => void;
  /** Shows a Retry button that runs this: a restore that failed (undoWith). */
  onRetry?: () => void;
  /**
   * The rows the change behind the toast touched, as "<table>:<row id>" or "<table>:*" for a whole list. A newer toast
   * that touches one of them takes this toast's Undo and Retry away, so an older Undo never writes over a newer change.
   */
  touches?: string[];
  /** The write the toast reports, when the toast shows before it answers: if it fails, the toast goes. */
  saved?: Promise<Written>;
}

interface ToastContextValue {
  showToast: (toast: Omit<Toast, "id">) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** Whether two `touches` lists name a row in common ("<table>:*" names every row of its table). */
export function touchesOverlap(a: string[] = [], b: string[] = []) {
  // A key with no ":" is its whole table name
  const table = (key: string) => key.split(":")[0];
  return a.some((x) => b.some((y) => x === y || ((x.endsWith(":*") || y.endsWith(":*")) && table(x) === table(y))));
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (toastData: Omit<Toast, "id">) => {
      const id = Math.random().toString(36).slice(2);
      const newToast: Toast = { ...toastData, id };
      setToasts((prev) => [
        ...prev.map((t) => (touchesOverlap(t.touches, newToast.touches) ? { ...t, onUndo: undefined, onRetry: undefined } : t)),
        newToast,
      ]);
      toastData.saved?.then(
        (answer) => !succeeded(answer) && removeToast(id),
        () => removeToast(id),
      );
    },
    [removeToast],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* One status region for the whole stack, there before any toast, so each new toast is said once; not on each
          toast, as a region added with its text is not reliably read and one inside this region would be read twice.
          aria-atomic="false": status reads its whole content by default, which would repeat the older toasts. */}
      <div className="toast-container" role="status" aria-atomic="false">
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
                    t.onUndo?.({ touches: t.touches });
                    removeToast(t.id);
                  }}
                >
                  Undo
                </button>
              )}
              {t.onRetry && (
                <button
                  type="button"
                  className="toast-action-btn"
                  onClick={() => {
                    t.onRetry?.();
                    removeToast(t.id);
                  }}
                >
                  Retry
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

const DURATION = 5000; // how long a toast stays on screen
const LINGER = 1500; // after the pointer or focus leaves, a nearly expired toast still stays this long

/** Counts down its toast's time, paused while the mouse is over it or focus is inside it. */
function ToastItem({ toast, onExpire, children }: { toast: Toast; onExpire: (id: string) => void; children: React.ReactNode }) {
  const left = useRef(DURATION);
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

/** What a write answers: a server action's `{ success }`, a plain yes or no, or nothing when it threw. */
type Written = boolean | { success?: boolean } | null | undefined;

const succeeded = (back: Written) => back === true || (!!back && typeof back === "object" && !!back.success);

/**
 * An Undo that writes the old state back. The screen goes back first inside `write`, which puts it right again when the
 * write fails; a write that throws or does not answer success shows `failed` (or what it returns for the answer) as a
 * warning with a Retry that runs the restore again, and that touches what the Undo's toast touched.
 * A `write` that has already told the user why it did nothing returns `true`.
 */
export function undoWith<R extends Written>(
  showToast: ToastContextValue["showToast"],
  write: () => Promise<R>,
  failed: string | ((back: Exclude<R, true> | null) => string) = "Failed to undo",
) {
  const undo = async (from?: UndoFrom) => {
    const back = await write().catch(() => null);
    if (succeeded(back)) return;
    showToast({
      message: typeof failed === "function" ? failed(back as Exclude<R, true> | null) : failed,
      type: "warning",
      touches: from?.touches,
      onRetry: () => void undo(from),
    });
  };
  return undo;
}
