// Build-time flags (NEXT_PUBLIC_* is inlined by Next.js). Off unless set to "true".
// Claude: off on Vercel and on Azure (the image has no `claude` CLI), on only for a local run with the CLI installed. Push: on Azure (queue + worker), off on the free variant.
export const isClaudeEnabled = () => process.env.NEXT_PUBLIC_CLAUDE_ENABLED === "true";
export const isPushEnabled = () => process.env.NEXT_PUBLIC_PUSH_ENABLED === "true";

export function assertClaudeEnabled() {
  if (!isClaudeEnabled()) throw new Error("The Claude integration is disabled.");
}

export function assertPushEnabled() {
  if (!isPushEnabled()) throw new Error("Push notifications are disabled.");
}
