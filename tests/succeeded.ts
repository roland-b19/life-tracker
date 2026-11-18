import type { Failure } from "@/lib/validations/result";

/** The answer of a server action that must have succeeded: narrows it, or fails the test with the refusal's message. */
export function succeeded<T extends object>(answer: ({ success: true } & T) | Failure) {
  if (!answer.success) throw new Error(`The action refused: ${answer.error}`);
  return answer;
}
