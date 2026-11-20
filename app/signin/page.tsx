import { SignInForm } from "./signin-form";

/** Where to go after sign-in: `next` when it is a path on this site (one leading `/`), else Tasks. */
function afterSignIn(next: string | undefined) {
  return next && /^\/(?![/\\])/.test(next) ? next : "/todos";
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  const provider = process.env.AUTH_DEV === "true" ? "dev" : (process.env.AUTH_PROVIDER ?? "azure-ad");
  return <SignInForm provider={provider} denied={error === "AccessDenied"} next={afterSignIn(next)} />;
}
