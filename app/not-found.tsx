import Link from "next/link";

export default function NotFound() {
  return (
    <main className="signin-page">
      <section className="surface signin" aria-labelledby="not-found-title">
        <p className="signin-brand">Life Tracker</p>
        <h1 id="not-found-title" className="section-title">
          Page not found
        </h1>
        <p className="muted">This page does not exist.</p>
        <div className="signin-form">
          <Link href="/">Go to the start page</Link>
        </div>
      </section>
    </main>
  );
}
