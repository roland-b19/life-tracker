"use client";

// Replaces the root layout when it fails, so it cannot rely on globals.css: plain inline styles, dark like the app.
export default function GlobalError({ retry }: { retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#000", color: "#fff", font: "16px system-ui, sans-serif" }}>
        <main style={{ maxWidth: "26rem", margin: "20vh auto 0", padding: "0 1rem" }} role="alert">
          <h1 style={{ fontSize: "1.5rem" }}>Something went wrong</h1>
          <p style={{ opacity: 0.7 }}>The app could not be loaded.</p>
          <button
            type="button"
            onClick={() => retry()}
            style={{ font: "inherit", padding: "0.75rem 1.25rem", borderRadius: "0.75rem", border: 0, background: "#0a84ff", color: "#fff" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
