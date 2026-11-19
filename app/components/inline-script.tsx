"use client";

/**
 * A script the browser runs while parsing the server HTML, before the first paint. When React renders it on the client
 * (an error recovery re-renders the root layout) it is `text/plain`, so it neither runs again nor makes React warn about
 * a `<script>` in a component; `suppressHydrationWarning` covers the type mismatch (Next's guide "Preventing flash
 * before hydration").
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
