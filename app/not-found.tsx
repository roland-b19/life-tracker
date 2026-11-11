import Link from "next/link";
import { CenterCard } from "./components/blocks";

export default function NotFound() {
  return (
    <CenterCard id="not-found-title" title="Page not found">
      <p className="muted">This page does not exist.</p>
      <div className="signin-form">
        <Link href="/">Go to the start page</Link>
      </div>
    </CenterCard>
  );
}
