/** How close to the left or right screen edge a touch counts as the start of a swipe back or forward. */
export const EDGE_PX = 20;

/**
 * Controls a touch may start on even at the edge: cancelling it would cancel the tap too. `tabIndex={-1}` only lets
 * script focus an element (the modal card, the More menu), so it is no control: a touch on their outer pixels is guarded.
 */
export const CONTROL =
  'a, button, input, select, textarea, label, summary, [role=button], [role=tab], [tabindex]:not([tabindex="-1"])';
