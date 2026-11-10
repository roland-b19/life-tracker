"use client";

import React, { useEffect, useCallback, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "./icons";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
  /** Called once the closing form has faded out (it stays mounted a little longer for the tail). */
  onExited?: () => void;
  /** Extra class on the card, e.g. the page's font. */
  className?: string;
}

const CLOSE_MS = 420; // --dur in globals.css
const FADED_MS = 280; // the close's ease leaves under 10% opacity by here

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = "36rem",
  onExited,
  className,
}: ModalProps) {
  // Stays mounted while it plays the open animation in reverse (.closing in globals.css).
  const [shown, setShown] = useState(isOpen);
  if (isOpen && !shown) setShown(true);
  const closing = shown && !isOpen;
  const exited = useRef(onExited);
  useEffect(() => {
    exited.current = onExited;
  });
  useEffect(() => {
    if (!closing) return;
    const fast = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const faded = setTimeout(() => exited.current?.(), fast ? 0 : FADED_MS);
    const gone = setTimeout(() => setShown(false), fast ? 0 : CLOSE_MS);
    return () => {
      clearTimeout(faded);
      clearTimeout(gone);
    };
  }, [closing]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose],
  );

  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener("keydown", handleKeyDown);

    // The page behind must not scroll. Not pinned with position:fixed on the body: on iOS that reflowed the whole
    // page as the form opened (jank) and left a bare black strip at the bottom. A touchmove lock (below) stops
    // the drags; overflow:hidden stops the wheel and keys.
    const scrollY = window.scrollY;
    const root = document.documentElement;
    root.style.overflow = "hidden";

    // No autofill, autocorrect or spell-check bar above the keyboard in any form (it makes the keyboard taller).
    backdropRef.current?.querySelectorAll("input, textarea").forEach((f) => {
      f.setAttribute("autocomplete", "off");
      f.setAttribute("autocorrect", "off");
      f.setAttribute("spellcheck", "false");
    });

    // Keep the backdrop the size of the visible area so the keyboard never pushes or zooms the card.
    const vv = window.visualViewport;
    // Moving to a field with another keyboard (text, number pad) changes the visible height. The form only ever
    // shrinks while the keyboard is up, and grows back when it is dismissed, so a switch never makes it twitch.
    let low = Infinity;
    const fit = () => {
      const el = backdropRef.current;
      if (!el || !vv) return;
      const keyboard = window.innerHeight - vv.height > 120;
      low = keyboard ? Math.min(low, vv.height) : Infinity;
      el.style.height = `${keyboard ? low : vv.height}px`;
      el.style.transform = `translateY(${vv.offsetTop}px)`;
      // The keyboard covers the bottom, so the bottom padding for the home bar is not needed then.
      el.toggleAttribute("data-keyboard", keyboard);
    };
    fit();
    vv?.addEventListener("resize", fit);
    vv?.addEventListener("scroll", fit);

    // With the keyboard open iOS lets a drag pan the page behind the form. Only the form's own scroll may take one.
    const lock = (e: TouchEvent) => {
      const body = (e.target as Element).closest(".modal-body");
      if (!body || body.scrollHeight <= body.clientHeight) e.preventDefault();
    };
    document.addEventListener("touchmove", lock, { passive: false });
    // iOS may still scroll the document to reveal a focused field; put the page back where it was.
    const pin = () => {
      if (window.scrollY !== scrollY) window.scrollTo(0, scrollY);
    };
    window.addEventListener("scroll", pin);

    return () => {
      document.removeEventListener("touchmove", lock);
      window.removeEventListener("scroll", pin);
      window.removeEventListener("keydown", handleKeyDown);
      vv?.removeEventListener("resize", fit);
      vv?.removeEventListener("scroll", fit);
      root.style.overflow = "";
      window.scrollTo(0, scrollY);
    };
  }, [isOpen, handleKeyDown]);

  if (!shown) return null;

  // Portaled to body so the page behind can shrink (a transformed parent would trap the fixed backdrop).
  return createPortal(
    <>
    <div className={closing ? "modal-scrim closing" : "modal-scrim"} aria-hidden="true" />
    <div
      ref={backdropRef}
      className={closing ? "modal-backdrop closing" : "modal-backdrop"}
      inert={closing}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={className ? `modal-card ${className}` : "modal-card"}
        style={{ maxWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-header-row">
            <h2 id="modal-title" className="modal-title">
              {title}
            </h2>
            <button
              type="button"
              className="modal-close-btn"
              onClick={onClose}
              aria-label="Close modal"
            >
              <CloseIcon size={13} />
            </button>
          </div>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
    </>,
    document.body,
  );
}

/**
 * A saved form's list change waits until the form has faded, so its whole animation is visible:
 * `later(change)` holds it, `runAfterClose` (the Modal's onExited, and an Undo that may come first) runs it.
 */
export function useAfterClose() {
  const pending = useRef<(() => void) | null>(null);
  return useMemo(() => {
    const runAfterClose = () => {
      const run = pending.current;
      pending.current = null;
      run?.();
    };
    const later = (change: () => void) => {
      const before = pending.current;
      pending.current = before ? () => (before(), change()) : change;
    };
    return { later, runAfterClose };
  }, []);
}

