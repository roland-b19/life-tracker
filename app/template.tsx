import { ViewTransition } from "react";

/** Templates remount on every navigation, so the old page exits and the new one enters. */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="page-enter" exit="page-exit" default="none">
      {children}
    </ViewTransition>
  );
}
