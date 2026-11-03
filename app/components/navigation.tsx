"use client";

import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

export function Navigation({ userName }: { userName: string }) {
  const pathname = usePathname();

  return (
    <header className="nav-header">
      <div className="nav-top">
        <div>
          <span className="app-subtitle">Life Tracker</span>
          <h1 className="app-title">
            {pathname.startsWith("/gym")
              ? "Gym & Training"
              : pathname.startsWith("/food")
              ? "Food & Nutrition"
              : pathname.startsWith("/money")
              ? "Money & Expenses"
              : "Weigh-ins"}
          </h1>
        </div>
        <div className="nav-user-actions">
          <span className="user-badge" title={`Signed in as ${userName}`}>
            {userName}
          </span>
          <button
            className="secondary signout-btn"
            type="button"
            onClick={() => signOut({ callbackUrl: "/signin" })}
          >
            Sign out
          </button>
        </div>
      </div>

      <nav className="segmented-control" aria-label="Main Navigation">
        <NextLink
          href="/gym"
          className={`segment-tab ${pathname.startsWith("/gym") ? "active" : ""}`}
        >
          Gym Split
        </NextLink>
        <NextLink
          href="/food"
          className={`segment-tab ${pathname.startsWith("/food") ? "active" : ""}`}
        >
          Food & Macros
        </NextLink>
        <NextLink
          href="/"
          className={`segment-tab ${pathname === "/" ? "active" : ""}`}
        >
          Weigh-ins
        </NextLink>
        <NextLink
          href="/money"
          className={`segment-tab ${pathname.startsWith("/money") ? "active" : ""}`}
        >
          Money
        </NextLink>
      </nav>
    </header>
  );
}
