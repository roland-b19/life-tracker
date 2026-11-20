"use client";

import { useEffect, useState, type CSSProperties } from "react";
import NextLink from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useToast } from "./toast";
import { clearPageCache } from "./page-cache";
import { isPushEnabled } from "@/lib/features";
import { deletePushSubscriptionAction } from "@/actions/todos";

/**
 * Before sign-out, while the session still exists: forgets this device's reminders on the server and in the browser,
 * so a signed-out device gets none. Other devices keep theirs (D-041).
 */
async function forgetThisDevicePush() {
  if (!isPushEnabled() || !("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  if (!(await deletePushSubscriptionAction(subscription.endpoint)).success) throw new Error("not removed");
  await subscription.unsubscribe();
}

interface NavigationProps {
  userName: string;
}

export function Navigation({ userName }: NavigationProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  // The page a pressed link goes to. Until it loads the bar already shows it, instead of snapping back to this page.
  const [target, setTarget] = useState<string | null>(null);
  const at = target ?? pathname;
  const go = (href: string) => {
    setTarget(href);
    setMoreOpen(false);
  };
  // A More-menu link leaves the menu open (the new page replaces it on arrival), so the old page never shows through while Settings loads.
  const goFromMenu = (href: string) => (href === pathname ? setMoreOpen(false) : setTarget(href));

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMoreOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  const getPageTitle = () => {
    if (pathname.startsWith("/gym")) return "Gym";
    if (pathname.startsWith("/health")) return "Health";
    if (pathname.startsWith("/todos")) return "Tasks";
    if (pathname.startsWith("/wishlist")) return "Wishlist";
    if (pathname.startsWith("/settings")) return "Settings";
    return "Life Tracker";
  };

  const links = [
    {
      href: "/gym",
      label: "Gym",
      isActive: at.startsWith("/gym"),
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 5v14M18 5v14M2 9v6M22 9v6M6 12h12" />
        </svg>
      ),
    },
    {
      href: "/health",
      label: "Health",
      isActive: at.startsWith("/health"),
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8zM6 1v3M10 1v3M14 1v3" />
        </svg>
      ),
    },
    {
      href: "/todos",
      label: "Tasks",
      isActive: at.startsWith("/todos"),
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
      isActive: at.startsWith("/wishlist"),
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ),
    },
    {
      href: "/settings",
      label: "Settings",
      isActive: at.startsWith("/settings"),
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      ),
    },
  ];

  const primary = links.slice(0, 4);
  const overflow = links.slice(4);
  const moreActive = overflow.some((l) => l.isActive);
  const initial = userName.charAt(0).toUpperCase();
  const active = moreActive || moreOpen ? primary.length : primary.findIndex((l) => l.isActive);
  // redirect:false because NextAuth builds the redirect from NEXTAUTH_URL (localhost in dev), which a phone cannot reach.
  const router = useRouter();
  const { showToast } = useToast();
  const signOutNow = async () => {
    try {
      await forgetThisDevicePush();
      await signOut({ redirect: false });
    } catch {
      showToast({ message: "Failed to sign out", type: "warning" });
      return;
    }
    await clearPageCache();
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
          {links.map((link) => (
            <NextLink
              key={link.href}
              href={link.href}
              prefetch
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
          <div className="more-menu" id="more-menu" role="dialog" aria-label="More">
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
            <div className="more-links">
              {overflow.map((link) => (
                <NextLink
                  key={link.href}
                  href={link.href}
                  className={`nav-link ${link.isActive ? "active" : ""}`}
                  aria-current={link.isActive ? "page" : undefined}
                  onClick={() => goFromMenu(link.href)}
                >
                  {link.icon}
                  <span>{link.label}</span>
                </NextLink>
              ))}
            </div>
          </div>
        </>
      )}
      <nav
        className="tabbar"
        aria-label="Mobile Navigation"
        data-idle={active < 0 ? "" : undefined}
        style={{ "--n": primary.length + 1, "--i": Math.max(active, 0) } as CSSProperties}
      >
        {primary.map((link) => (
          <NextLink
            key={link.href}
            href={link.href}
            prefetch
            className={`tab-item ${link.isActive ? "active" : ""}`}
            aria-current={link.isActive ? "page" : undefined}
            onClick={() => go(link.href)}
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
          onClick={() => {
            setMoreOpen((v) => !v);
          }}
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
