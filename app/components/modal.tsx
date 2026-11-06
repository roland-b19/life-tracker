"use client";

import React, { useEffect, useCallback, useRef, useState } from "react";
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

    // iOS ignores overflow:hidden on body, so pin it in place and restore the scroll position on close.
    const scrollY = window.scrollY;
    const body = document.body;
    body.style.position = "fixed";
    body.style.top = `${-scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";

    // Keep the backdrop the size of the visible area so the keyboard never pushes or zooms the card.
    const vv = window.visualViewport;
    const fit = () => {
      const el = backdropRef.current;
      if (!el || !vv) return;
      el.style.height = `${vv.height}px`;
      el.style.transform = `translateY(${vv.offsetTop}px)`;
    };
    fit();
    vv?.addEventListener("resize", fit);
    vv?.addEventListener("scroll", fit);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      vv?.removeEventListener("resize", fit);
      vv?.removeEventListener("scroll", fit);
      body.style.position = "";
      body.style.top = "";
      body.style.left = "";
      body.style.right = "";
      body.style.width = "";
      window.scrollTo(0, scrollY);
    };
  }, [isOpen, handleKeyDown]);

  if (!shown) return null;

  // Portaled to body so the page behind can shrink (a transformed parent would trap the fixed backdrop).
  return createPortal(
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
        className="modal-card"
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
    </div>,
    document.body,
  );
}
