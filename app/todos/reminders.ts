/**
 * Whether this browser can take task reminders and already does. "On" is a push subscription held here: the
 * notification permission alone says nothing, since it stays granted after "Reminders enabled" is undone (or was given
 * earlier on this device), and the card must then offer Enable again.
 */
export async function remindersState(): Promise<{ supported: boolean; subscribed: boolean }> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { supported: false, subscribed: false };
  }
  const registration = await navigator.serviceWorker.ready;
  return { supported: true, subscribed: (await registration.pushManager.getSubscription()) !== null };
}
