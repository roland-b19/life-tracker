"use client";

import { FormEvent, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { CenterCard, ErrorText, Field } from "../components/blocks";
import { clearPageCache } from "../components/page-cache";

const PROVIDER_LABEL: Record<string, string> = { "azure-ad": "Microsoft", github: "GitHub" };

/**
 * `provider` is "dev" (username form, local only) or the id of the configured OAuth provider. `next` is the same-site
 * path to open after sign-in (the page checks it).
 */
export function SignInForm({ provider, denied, next }: { provider: string; denied: boolean; next: string }) {
  const router = useRouter();
  const [name, setName] = useState("owner");
  const [errorMsg, setErrorMsg] = useState(denied ? "This account is not allowed to use this app." : "");
  const [busy, setBusy] = useState(false);
  // Whoever signs in next never sees pages kept for the previous session.
  useEffect(() => void clearPageCache(), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setErrorMsg("");
    const result = await signIn("credentials", { name, redirect: false, callbackUrl: next }).catch(() => null);
    if (result?.ok) {
      // Replaces the sign-in page: Back never returns to it (D-035).
      router.replace(next);
      router.refresh();
    } else {
      setErrorMsg(
        result?.error === "CredentialsSignin"
          ? "Please enter a username using lower-case letters, numbers or dashes."
          : "Failed to sign in",
      );
      setBusy(false);
    }
  }

  return (
    <CenterCard id="signin-title" title="Welcome back" pulse>
      {provider !== "dev" ? (
        <div className="form-stack signin-form">
          {errorMsg && <ErrorText>{errorMsg}</ErrorText>}
          <button
            type="button"
            disabled={busy}
            className="signin-continue"
            onClick={() => {
              setBusy(true);
              void signIn(provider, { callbackUrl: next });
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
          {errorMsg && <ErrorText>{errorMsg}</ErrorText>}
          {/* Only disabled while signing in, so it keeps its full colour instead of the greyed disabled look */}
          <button type="submit" disabled={busy} className="signin-continue">
            {busy ? "Signing in..." : "Continue"}
          </button>
        </form>
      )}
    </CenterCard>
  );
}
