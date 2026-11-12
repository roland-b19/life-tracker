"use client";

import { FormEvent, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { CenterCard, Field } from "../components/blocks";
import { clearPageCache } from "../components/page-cache";

const PROVIDER_LABEL: Record<string, string> = { "azure-ad": "Microsoft", github: "GitHub" };

/** `provider` is "dev" (username form, local only) or the id of the configured OAuth provider. */
export function SignInForm({ provider, denied }: { provider: string; denied: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("owner");
  const [error, setError] = useState(denied ? "This account is not allowed to use this app." : "");
  const [busy, setBusy] = useState(false);
  // Whoever signs in next never sees pages kept for the previous session.
  useEffect(() => void clearPageCache(), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
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
    <CenterCard id="signin-title" title="Welcome back" pulse>
      {provider !== "dev" ? (
        <div className="form-stack signin-form">
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button
            type="button"
            disabled={busy}
            className="signin-continue"
            onClick={() => {
              setBusy(true);
              void signIn(provider, { callbackUrl: "/" });
            }}
          >
            {busy ? "Signing in..." : `Continue with ${PROVIDER_LABEL[provider] ?? provider}`}
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="form-stack signin-form">
          <Field
            label="Username"
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
      )}
    </CenterCard>
  );
}
