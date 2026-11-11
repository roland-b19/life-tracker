"use client";

import Link from "next/link";
import { CenterCard } from "./components/blocks";

// `digest` is the id Next prints next to the real error in the server log; the message itself never reaches the browser.
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;
  return (
    <CenterCard id="error-title" title="Something went wrong" role="alert">
      <p className="muted">The page could not be loaded. Try again, and if it keeps failing, note the reference below.</p>
      {digest && <p className="muted">Reference: {digest}</p>}
      <div className="signin-form form-stack">
        <button type="button" className="signin-continue" onClick={() => retry()}>
          Try again
        </button>
        <Link href="/">Go to the start page</Link>
      </div>
    </CenterCard>
  );
}
