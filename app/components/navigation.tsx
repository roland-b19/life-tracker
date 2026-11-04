"use client";

import { useState, useEffect } from "react";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { CommandMenu } from "./command-menu";

export function Navigation({ userName }: { userName: string }) {
  const pathname = usePathname();
  const [isCommandOpen, setIsCommandOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsCommandOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const getPageTitle = () => {
    if (pathname.startsWith("/gym")) return "Gym & Training";
    if (pathname.startsWith("/food")) return "Food & Nutrition";
    if (pathname.startsWith("/money")) return "Money & Expenses";
    if (pathname.startsWith("/todos")) return "Daily Tasks & Habits";
    if (pathname.startsWith("/wishlist")) return "Wishlist";
    if (pathname.startsWith("/business")) return "Family Business";
    return "Weigh-ins & Analytics";
  };

  const getPageSubtitle = () => {
    if (pathname.startsWith("/gym")) return "5-Day Split · PRs · Progressive Overload";
    if (pathname.startsWith("/food")) return "Targets · Macros · Meals · AI Assistant";
    if (pathname.startsWith("/money")) return "Cash Flow · Categories · Strict Privacy";
    if (pathname.startsWith("/todos")) return "Carry-Over · Streaks · Operations";
    if (pathname.startsWith("/wishlist")) return "Private Desires · Cost Estimations";
    if (pathname.startsWith("/business")) return "Monthly Net Profit · Operations · Incomes";
    return "Body Weight · 7-Day Trend · Weekly Delta";
  };

  return (
    <header className="nav-header">
      <div className="nav-top">
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span className="app-subtitle">Life Tracker</span>
            <span
              style={{
                display: "inline-block",
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                background: "#34c759",
                boxShadow: "0 0 6px #34c759",
              }}
              title="Cloud database online & secure"
            />
          </div>
          <h1 className="app-title">{getPageTitle()}</h1>
          <p className="app-description" style={{ margin: "0.2rem 0 0", fontSize: "0.85rem", color: "var(--secondary)" }}>
            {getPageSubtitle()}
          </p>
        </div>

        <div className="nav-user-actions">
          <button
            type="button"
            className="command-trigger-btn"
            onClick={() => setIsCommandOpen(true)}
            aria-label="Open command menu"
            title="Search & commands (⌘K)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span className="command-trigger-label">Search</span>
            <kbd className="command-kbd">⌘K</kbd>
          </button>

          <div className="user-profile-badge">
            <span className="user-avatar-circle">{userName.charAt(0).toUpperCase()}</span>
            <span className="user-name-text">{userName}</span>
          </div>
          <button
            className="signout-btn"
            type="button"
            onClick={() => signOut({ callbackUrl: "/signin" })}
            title="Sign out of your account"
          >
            Sign out
          </button>
        </div>
      </div>

      <div className="segmented-control-wrapper">
        <nav className="segmented-control" aria-label="Main Navigation">
          <NextLink
            href="/gym"
            className={`segment-tab ${pathname.startsWith("/gym") ? "active" : ""}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 5v14M18 5v14M2 9v6M22 9v6M6 12h12" />
            </svg>
            <span>Gym</span>
          </NextLink>

          <NextLink
            href="/food"
            className={`segment-tab ${pathname.startsWith("/food") ? "active" : ""}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8zM6 1v3M10 1v3M14 1v3" />
            </svg>
            <span>Food</span>
          </NextLink>

          <NextLink
            href="/"
            className={`segment-tab ${pathname === "/" ? "active" : ""}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18M18 9l-5 5-4-4-3 3" />
            </svg>
            <span>Weight</span>
          </NextLink>

          <NextLink
            href="/money"
            className={`segment-tab ${pathname.startsWith("/money") ? "active" : ""}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <line x1="2" y1="10" x2="22" y2="10" />
            </svg>
            <span>Money</span>
          </NextLink>

          <NextLink
            href="/todos"
            className={`segment-tab ${pathname.startsWith("/todos") ? "active" : ""}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            <span>Tasks</span>
          </NextLink>

          <NextLink
            href="/wishlist"
            className={`segment-tab ${pathname.startsWith("/wishlist") ? "active" : ""}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            <span>Wishlist</span>
          </NextLink>

          <NextLink
            href="/business"
            className={`segment-tab ${pathname.startsWith("/business") ? "active" : ""}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
            <span>Business</span>
          </NextLink>
        </nav>
      </div>

      <CommandMenu
        isOpen={isCommandOpen}
        onClose={() => setIsCommandOpen(false)}
      />
    </header>
  );
}
