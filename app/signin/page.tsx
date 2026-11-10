import { SignInForm } from "./signin-form";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const provider = process.env.AUTH_DEV === "true" ? "dev" : (process.env.AUTH_PROVIDER ?? "azure-ad");
  return <SignInForm provider={provider} denied={error === "AccessDenied"} />;
}
