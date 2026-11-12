"use client";

import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "./icons";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
  /** Extra class on the card, e.g. the page's font. */
  className?: string;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = "36rem",
  className,
}: ModalProps) {
  // The parent re-renders on every keystroke and hands over a new onClose each time; the effect below must not re-run
  // for that, or it would give focus back to the opener (the keyboard closes after one character).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", handleKeyDown);

    // Keyboard and screen-reader users stay inside the dialog: focus moves to it (the card, not a field: no form autofocuses),
    // the page behind is inert, Tab wraps, and closing returns focus to the button that opened it.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const card = backdropRef.current?.querySelector<HTMLElement>(".modal-card");
    card?.focus({ preventScroll: true });
    const behind = [...document.body.children].filter(
      (el) => !el.matches("script, .modal-scrim, .modal-backdrop, .toast-container") && !el.hasAttribute("inert"),
    );
    behind.forEach((el) => el.setAttribute("inert", ""));
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !card) return;
      const stops = [...card.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])")].filter(
        (el) => !el.hasAttribute("disabled") && el.offsetParent !== null,
      );
      if (!stops.length) return e.preventDefault();
      const first = stops[0];
      const last = stops[stops.length - 1];
      const from = e.shiftKey && (document.activeElement === first || document.activeElement === card);
      const past = !e.shiftKey && document.activeElement === last;
      if (!from && !past) return;
      e.preventDefault();
      (from ? last : first).focus();
    };
    window.addEventListener("keydown", trap);

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

    // The log from a phone showed iOS panning the visual viewport ~110px for a moment on every focus (the page behind
    // flashes and the form with it), although every field was already visible. A tap focuses the field itself with
    // preventScroll, so iOS has no scroll-into-view to do. A drag is left alone, so the form still scrolls.
    let startX = 0;
    let startY = 0;
    const tapStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };
    const tapEnd = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      if (Math.abs(t.clientX - startX) > 10 || Math.abs(t.clientY - startY) > 10) return;
      const hit = (e.target as Element).closest("input, textarea, label");
      const field = hit instanceof HTMLLabelElement ? hit.control : hit;
      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return;
      const typing = field instanceof HTMLTextAreaElement || /^(text|number|search|email|tel|url|password)$/.test(field.type);
      if (!typing || field.disabled || !field.closest(".modal-body")) return;
      e.preventDefault();
      field.focus({ preventScroll: true });
    };
    document.addEventListener("touchstart", tapStart, { passive: true });
    document.addEventListener("touchend", tapEnd, { passive: false });

    return () => {
      document.removeEventListener("touchstart", tapStart);
      document.removeEventListener("touchend", tapEnd);
      document.removeEventListener("touchmove", lock);
      window.removeEventListener("scroll", pin);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keydown", trap);
      behind.forEach((el) => el.removeAttribute("inert"));
      if (opener?.isConnected) opener.focus({ preventScroll: true });
      vv?.removeEventListener("resize", fit);
      vv?.removeEventListener("scroll", fit);
      root.style.overflow = "";
      window.scrollTo(0, scrollY);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Portaled to body so the page behind can shrink (a transformed parent would trap the fixed backdrop).
  return createPortal(
    <>
    <div className="modal-scrim" aria-hidden="true" />
    <div
      ref={backdropRef}
      className="modal-backdrop"
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
        tabIndex={-1}
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
