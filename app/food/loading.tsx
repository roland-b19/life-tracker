import { isClaudeEnabled } from "@/lib/features";
import { HealthSkeleton } from "../components/skeletons";

export default function Loading() {
  return <HealthSkeleton claude={isClaudeEnabled()} />;
}
