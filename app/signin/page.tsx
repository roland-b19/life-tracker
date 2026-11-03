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
    const result = await signIn("credentials", { name, redirect: false });
    if (result?.ok) {
      router.push("/");
      router.refresh();
    } else {
      setError("Enter a user name using letters, numbers, dots, dashes, or underscores.");
      setBusy(false);
    }
  }

  return (
    <main className="signin">
      <section className="surface" aria-labelledby="signin-title">
        <h1 id="signin-title">Sign in</h1>
        <p className="muted">Development sign-in is enabled for local work only.</p>
        <form onSubmit={submit} className="form-row">
          <label>
            User name
            <input
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="username"
              required
              autoFocus
            />
          </label>
          <button type="submit" disabled={busy}>
            {busy ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <p className="error" aria-live="polite">
          {error}
        </p>
      </section>
    </main>
  );
}
