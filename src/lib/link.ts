/** A typed URL opens as a link (shown as its host); anything else (a store name) is plain text. */
export function linkOf(value: string) {
  // A bare domain: labels, the last one 2+ letters (so "v1.2" or "3.5kg" stay text), then an optional path or query.
  const host = /^([\w-]+(?:\.[\w-]+)*\.([a-z]{2,}))(?:[/?#]\S*)?$/i.exec(value);
  // shortcut: a bare "name.js" style word is not a site; only these common file endings are told apart, extend the list if another shows up.
  const bare = host !== null && !/^(js|ts|jsx|tsx|py|rb|go|rs|md|json|css|html)$/i.test(host[2]);
  const href = /^https?:\/\/\S+$/i.test(value) ? value : bare ? `https://${value}` : null;
  // A link with a user name or password in it is shown as text, never opened or put on screen as a host.
  const url = href && URL.canParse(href) ? new URL(href) : null;
  return url && !url.username && !url.password ? { href, label: `${url.host} ↗` } : { href: null, label: value };
}
