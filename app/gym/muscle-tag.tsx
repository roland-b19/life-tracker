import { muscleLabel } from "@/lib/gym-muscles";
import { Badge } from "../components/blocks";

/** An exercise's muscle group as a tag; every Gym tag shares one width, so stacked rows line up (D-031). */
export function MuscleTag({ group }: { group: string }) {
  return <Badge kind="rest" className="muscle-tag">{muscleLabel(group)}</Badge>;
}
