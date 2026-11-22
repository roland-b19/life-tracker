import type { Answer } from "@/lib/validations/result";

/** The answer of a server action that must have succeeded: narrows it, or fails the test with the refusal's message. */
export function succeeded<T extends object>(answer: Answer<T>) {
  if (!answer.success) throw new Error(`The action refused: ${answer.error}`);
  return answer;
}

/** The answer of a server action that refused with `error`, for `toEqual`: a refusal is checked with its message. */
export function refused(error: string) {
  return { success: false, error };
}
