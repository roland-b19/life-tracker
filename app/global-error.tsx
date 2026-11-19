"use client";

// Replaces the root layout when it fails, so it cannot rely on globals.css or the Appearance switch: its own copy of the
// page, text, secondary and accent colors from the palette, light or dark as the system is.
const css = `
:root{color-scheme:light dark}
body{margin:0;background:#eef2f6;color:#0f1a2b;font:16px system-ui,sans-serif}
main{max-width:26rem;margin:20vh auto 0;padding:0 1rem}
h1{font-size:1.5rem}
p{color:#4a596b}
button{font:inherit;padding:.75rem 1.25rem;border-radius:.75rem;border:0;background:#199a81;color:#04201b}
@media (prefers-color-scheme:dark){body{background:#0b0f14;color:#eef3f8}p{color:#97a6b8}button{background:#1eb698}}
`;

export default function GlobalError({ retry }: { retry: () => void }) {
  return (
    <html lang="en">
      <head>
        <style>{css}</style>
      </head>
      <body>
        <main role="alert">
          <h1>Something went wrong</h1>
          <p>The app could not be loaded.</p>
          <button type="button" onClick={() => retry()}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
