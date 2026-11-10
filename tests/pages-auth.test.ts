import { describe, expect, it } from "vitest";

const pages = import.meta.glob("../app/**/page.tsx", { query: "?raw", import: "default", eager: true }) as Record<
  string,
  string
>;

// Pages with no data of their own: the sign-in form and the redirect from "/".
const PUBLIC = new Set(["../app/signin/page.tsx", "../app/page.tsx"]);

describe("pages require a session", () => {
  it("finds the pages", () => {
    expect(Object.keys(pages).length).toBeGreaterThan(PUBLIC.size);
  });

  it.each(Object.entries(pages).filter(([file]) => !PUBLIC.has(file)))("%s checks the session and redirects", (_file, source) => {
    expect(source).toContain("getServerSession(authOptions)");
    expect(source).toMatch(/redirect\(/);
  });
});
