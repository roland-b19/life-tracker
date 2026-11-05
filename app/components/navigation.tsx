"use client";

import { useEffect, useState } from "react";
import NextLink from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";

interface NavigationProps {
  userName: string;
}

export function Navigation({ userName }: NavigationProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMoreOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  const getPageTitle = () => {
    if (pathname.startsWith("/gym")) return "Gym";
    if (pathname.startsWith("/food")) return "Health";
    if (pathname.startsWith("/money")) return "Expenses";
    if (pathname.startsWith("/todos")) return "Tasks";
    if (pathname.startsWith("/wishlist")) return "Wishlist";
    return "Life Tracker";
  };

  const navLinks = [
    {
      href: "/gym",
      label: "Gym",
      isActive: pathname.startsWith("/gym"),
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 5v14M18 5v14M2 9v6M22 9v6M6 12h12" />
        </svg>
      ),
    },
    {
      href: "/food",
      label: "Health",
      isActive: pathname.startsWith("/food"),
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8zM6 1v3M10 1v3M14 1v3" />
        </svg>
      ),
    },
    {
      href: "/money",
      label: "Money",
      isActive: pathname.startsWith("/money"),
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <line x1="2" y1="10" x2="22" y2="10" />
        </svg>
      ),
    },
    {
      href: "/todos",
      label: "Tasks",
      isActive: pathname.startsWith("/todos"),
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      ),
    },
    {
      href: "/wishlist",
      label: "Wishlist",
      isActive: pathname.startsWith("/wishlist"),
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ),
    },
  ];

  const primary = navLinks.slice(0, 4);
  const overflow = navLinks.slice(4);
  const moreActive = overflow.some((l) => l.isActive);
  const initial = userName.charAt(0).toUpperCase();
  // redirect:false because NextAuth builds the redirect from NEXTAUTH_URL (localhost in dev), which a phone cannot reach.
  const router = useRouter();
  const signOutNow = async () => {
    await signOut({ redirect: false });
    router.push("/signin");
    router.refresh();
  };

  return (
    <>
      {/* Desktop sidebar (>= 1024px) */}
      <aside className="side" aria-label="Sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 13l5 5L20 6" />
            </svg>
          </span>
          Life Tracker
        </div>
        <nav aria-label="Main Navigation" style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
          {navLinks.map((link) => (
            <NextLink
              key={link.href}
              href={link.href}
              className={`nav-link ${link.isActive ? "active" : ""}`}
              aria-current={link.isActive ? "page" : undefined}
            >
              {link.icon}
              <span>{link.label}</span>
            </NextLink>
          ))}
        </nav>
        <div className="side-user">
          <div className="side-user-row">
            <span className="user-avatar-circle">{initial}</span>
            <span>{userName}</span>
          </div>
          <button className="btn-sm signout-btn" type="button" onClick={signOutNow}>
            Sign out
          </button>
        </div>
      </aside>

      {/* Page title */}
      <header className="page-head">
        <h1 className="app-title">{getPageTitle()}</h1>
      </header>

      {/* Phone and tablet: floating tab bar with a More menu */}
      {moreOpen && (
        <>
          <div className="more-scrim" onClick={() => setMoreOpen(false)} />
          <div className="more-menu" id="more-menu" aria-label="More">
            <div className="more-user">
              <span className="user-avatar-circle">{initial}</span>
              <div className="more-user-text">
                <span className="more-user-name">{userName}</span>
                <span className="more-user-brand">Life Tracker</span>
              </div>
              <button className="btn-sm signout-btn" type="button" onClick={signOutNow}>
                Sign out
              </button>
            </div>
            {overflow.map((link) => (
              <NextLink
                key={link.href}
                href={link.href}
                className={`nav-link ${link.isActive ? "active" : ""}`}
                onClick={() => setMoreOpen(false)}
              >
                {link.icon}
                <span>{link.label}</span>
              </NextLink>
            ))}
          </div>
        </>
      )}
      <nav className="tabbar" aria-label="Mobile Navigation">
        {primary.map((link) => (
          <NextLink
            key={link.href}
            href={link.href}
            className={`tab-item ${link.isActive ? "active" : ""}`}
            aria-current={link.isActive ? "page" : undefined}
            onClick={() => setMoreOpen(false)}
          >
            {link.icon}
            <span>{link.label}</span>
          </NextLink>
        ))}
        <button
          type="button"
          className={`tab-item ${moreActive || moreOpen ? "active" : ""}`}
          aria-expanded={moreOpen}
          aria-controls="more-menu"
          onClick={() => setMoreOpen((v) => !v)}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="5" cy="12" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="19" cy="12" r="1.8" />
          </svg>
          <span>More</span>
        </button>
      </nav>
    </>
  );
}
