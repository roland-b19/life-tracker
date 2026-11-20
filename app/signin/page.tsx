import { afterSignIn } from "./next-path";
import { SignInForm } from "./signin-form";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string | string[] }> }) {
  const { error, next } = await searchParams;
  const provider = process.env.AUTH_DEV === "true" ? "dev" : (process.env.AUTH_PROVIDER ?? "azure-ad");
  return <SignInForm provider={provider} denied={error === "AccessDenied"} next={afterSignIn(next)} />;
}
