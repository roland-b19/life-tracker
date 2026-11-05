"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function SignInPage() {
  const router = useRouter();
  const [name, setName] = useState("owner");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const result = await signIn("credentials", { name, redirect: false, callbackUrl: "/" });
    if (result?.ok) {
      router.push("/");
      router.refresh();
    } else {
      setError("Enter a user name using letters, numbers, dots, dashes, or underscores.");
      setBusy(false);
    }
  }

  return (
    <main style={{ minHeight: "85vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
      <section
        className="surface"
        style={{
          width: "100%",
          maxWidth: "26rem",
          padding: "2rem",
          borderRadius: "1.5rem",
          border: "1px solid var(--card-border)",
        }}
        aria-labelledby="signin-title"
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
          <span style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--tint)" }}>
            Life Tracker
          </span>
          <span className="cloud-pulse-dot" />
        </div>

        <h1 id="signin-title" style={{ fontSize: "1.75rem", fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>
          Welcome Back
        </h1>
        <p className="muted" style={{ margin: "0.35rem 0 1.5rem", fontSize: "0.875rem", lineHeight: 1.5 }}>
          Local development session. Enter your username to sign in.
        </p>

        <form onSubmit={submit} style={{ display: "grid", gap: "1rem" }}>
          <label style={{ display: "grid", gap: "0.4rem", fontWeight: 600, fontSize: "0.875rem" }}>
            Username
            <input
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="username"
              required
              autoFocus
              style={{ fontSize: "1.05rem" }}
            />
          </label>

          <button
            type="submit"
            disabled={busy}
            style={{ width: "100%", marginTop: "0.25rem", padding: "0.75rem", fontSize: "1rem" }}
          >
            {busy ? "Signing in..." : "Continue"}
          </button>
        </form>

        {error && (
          <p className="error" aria-live="polite" style={{ marginTop: "1rem", textAlign: "center" }}>
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
