"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { CheckIcon, CloseIcon } from "./icons";

interface Toast {
  id: string;
  message: string;
  type?: "info" | "success" | "warning";
  actionLabel?: string;
  onAction?: () => void;
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

    const duration = toastData.duration ?? 5000;
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-container" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast-item">
            <span className="toast-message">
              {t.type === "success" && <CheckIcon size={14} style={{ marginRight: "0.4rem", color: "var(--success)" }} />}
              {t.message}
            </span>
            <div className="toast-actions">
              {t.actionLabel && t.onAction && (
                <button
                  type="button"
                  className="toast-action-btn"
                  onClick={() => {
                    t.onAction?.();
                    removeToast(t.id);
                  }}
                >
                  {t.actionLabel}
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
          </div>
        ))}
      </div>
    </ToastContext.Provider>
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
