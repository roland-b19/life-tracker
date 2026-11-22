"use client";

import { FormEvent, useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { CenterCard, ErrorText, Field } from "../components/blocks";
import { clearPageCache } from "../components/page-cache";

const PROVIDER_LABEL: Record<string, string> = { "azure-ad": "Microsoft", github: "GitHub" };

/**
 * A sign-in whose CSRF token no longer matched its cookie: NextAuth answers with its sign-in page and `csrf=true`
 * instead of a session (the page's first session calls each set a new cookie while there is none).
 */
const csrfRefused = (url: string | null | undefined) => !!url && new URL(url, location.href).searchParams.has("csrf");

/**
 * How long the form waits for its session check before it lets the user try anyway: a check that never answers (a slow
 * or unreachable server) must not leave the page unusable. A CSRF token refused after that gets the one retry.
 */
const SESSION_CHECK_WAIT_MS = 5_000;

/**
 * `provider` is "dev" (username form, local only) or the id of the configured OAuth provider. `next` is the same-site
 * path to open after sign-in (the page checks it).
 */
export function SignInForm({ provider, denied, next }: { provider: string; denied: boolean; next: string }) {
  const router = useRouter();
  const [name, setName] = useState("owner");
  const [errorMsg, setErrorMsg] = useState(denied ? "This account is not allowed to use this app." : "");
  const [busy, setBusy] = useState(false);
  // Until the page is hydrated and its session check has answered, the form waits: a tap before would submit the page
  // natively (the name in the URL), text typed before would be reset, and the CSRF cookie could still change under it.
  // The status leaves "loading" only on the client, after the check, and the timer runs only there, so both cover
  // hydration too. A check still unanswered after SESSION_CHECK_WAIT_MS stops holding the form.
  const checking = useSession().status === "loading";
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    if (!checking) return;
    const timer = setTimeout(() => setWaited(true), SESSION_CHECK_WAIT_MS);
    return () => clearTimeout(timer);
  }, [checking]);
  const ready = !checking || waited;
  // Whoever signs in next never sees pages kept for the previous session.
  useEffect(() => void clearPageCache(), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setErrorMsg("");
    const attempt = () => signIn("credentials", { name, redirect: false, callbackUrl: next }).catch(() => null);
    let result = await attempt();
    // Once more with the cookie as it is now; a second refusal shows as a failure
    if (result?.ok && csrfRefused(result.url)) result = await attempt();
    if (result?.ok && !result.error && !csrfRefused(result.url)) {
      // Replaces the sign-in page: Back never returns to it (D-035).
      router.replace(next);
      router.refresh();
    } else {
      setErrorMsg(
        result?.error === "CredentialsSignin"
          ? "Please enter a username of up to 64 lower-case letters, numbers or dashes"
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
            disabled={!ready || busy}
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
            readOnly={!ready}
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            autoFocus
          />
          {errorMsg && <ErrorText>{errorMsg}</ErrorText>}
          {/* Disabled until the form is ready and while signing in; it keeps its full colour instead of the greyed disabled look */}
          <button type="submit" disabled={!ready || busy} className="signin-continue">
            {busy ? "Signing in..." : "Continue"}
          </button>
        </form>
      )}
    </CenterCard>
  );
}
