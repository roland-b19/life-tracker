import { SignInClient } from "./signin-client";

export default function SignInPage() {
  // Read on the server: the dev username form only exists when the dev provider does.
  return <SignInClient devAuth={process.env.AUTH_DEV === "true"} />;
}
