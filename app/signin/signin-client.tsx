"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export function SignInClient({ devAuth }: { devAuth: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("owner");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    if (!devAuth) {
      // Microsoft's hosted page offers email + password and Google, then returns here.
      await signIn("azure-ad", { callbackUrl: "/" });
      return;
    }
    const result = await signIn("credentials", { name, redirect: false, callbackUrl: "/" }).catch(() => null);
    if (result?.ok) {
      router.push("/");
      router.refresh();
    } else {
      setError(
        result?.error === "CredentialsSignin"
          ? "Please enter a username using letters, numbers, dots, dashes or underscores."
          : "Failed to sign in",
      );
      setBusy(false);
    }
  }

  return (
    <main className="signin-page">
      <section className="surface signin" aria-labelledby="signin-title">
        <p className="signin-brand">
          Life Tracker
          <span className="cloud-pulse-dot" aria-hidden="true" />
        </p>
        <h1 id="signin-title" className="section-title">
          Welcome back
        </h1>

        <form onSubmit={submit} className="form-stack signin-form">
          {devAuth ? (
            <label>
              Username
              <input
                name="name"
                disabled={busy}
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={64}
                required
                autoFocus
              />
            </label>
          ) : (
            <p className="muted">Use your email and password or your Google account.</p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {/* Only disabled while signing in, so it keeps its full colour instead of the greyed disabled look */}
          <button type="submit" disabled={busy} className="signin-continue">
            {busy ? "Signing in..." : "Continue"}
          </button>
        </form>
      </section>
    </main>
  );
}
