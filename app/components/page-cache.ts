/** Deletes the pages the service worker keeps for a fast start (`public/sw.js`); they hold personal data until this runs. */
export const clearPageCache = () => (typeof caches === "undefined" ? Promise.resolve(false) : caches.delete("life-tracker-pages-v1").catch(() => false));
