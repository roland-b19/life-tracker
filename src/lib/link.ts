/** A typed URL opens as a link (shown as its host); anything else (a store name) is plain text. */
export function linkOf(value: string) {
  // shortcut: a bare "name.js" style word is not a site; only these common file endings are told apart, extend the list if another shows up.
  const bare = /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(value) && !/\.(js|ts|jsx|tsx|py|rb|go|rs|md|json|css|html)(\/|$)/i.test(value);
  const href = /^https?:\/\/\S+$/i.test(value) ? value : bare ? `https://${value}` : null;
  // A link with a user name or password in it is shown as text, never opened or put on screen as a host.
  const host = href && URL.canParse(href) && !new URL(href).username && !new URL(href).password ? new URL(href).host : null;
  return host ? { href, label: `${host} ↗` } : { href: null, label: value };
}
