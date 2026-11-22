export const APP_TZ: string;
export const localDay: (d: Date) => string;
export const localTime: (d: Date) => string;
export const DUE_REMINDERS_SQL: string;
export const encodeMessage: (m: { todoId: string; userId: string }) => string;
export function parseMessage(text: string): { todoId: string; userId: string } | null;
export const buildPayload: (taskTitle: string) => string;
export const MAX_ATTEMPTS: number;
export function deliverReminder(
  deps: {
    query: (text: string, params: unknown[]) => Promise<{ rows: Record<string, string>[] }>;
    sendPush: (subscription: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string) => Promise<unknown>;
  },
  message: { todoId: string; userId: string },
): Promise<"skipped" | "sent" | "retry">;
