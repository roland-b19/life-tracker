import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ session: null as null | { user: { id?: string; name?: string | null } }, dbTouched: 0 }));
vi.mock("next-auth", () => ({ getServerSession: async () => state.session }));
vi.mock("@/auth", () => ({ authOptions: {} }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
  notFound: () => {
    throw new Error("notFound");
  },
}));
// Any query an anonymous visitor's page makes would go through `db`: touching it at all is a failure.
vi.mock("@/server/db", () => ({
  db: new Proxy({}, { get: () => (state.dbTouched++, () => { throw new Error("db read"); }) }),
}));

import { requirePageUser } from "@/server/auth";

type Load = () => Promise<{ default: (props: { children: string }) => unknown }>;
const pageLoaders = import.meta.glob("../app/**/page.tsx") as Record<string, Load>;
const layoutLoaders = import.meta.glob("../app/**/layout.tsx") as Record<string, Load>;
const sources = import.meta.glob("../app/**/*.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

// No data of their own: the sign-in form, the redirect from "/" and the root layout (fonts, providers).
const PUBLIC = new Set(["../app/signin/page.tsx", "../app/page.tsx", "../app/layout.tsx"]);
const guarded = (loaders: Record<string, Load>) => Object.entries(loaders).filter(([file]) => !PUBLIC.has(file));

beforeEach(() => {
  state.session = null;
  state.dbTouched = 0;
  vi.stubEnv("NEXT_PUBLIC_CLAUDE_ENABLED", "true"); // settings answers notFound() before it checks the session when off
});
afterEach(() => vi.unstubAllEnvs());

describe("pages require a session", () => {
  it("finds the pages and layouts", () => {
    expect(Object.keys(pageLoaders).length).toBeGreaterThan(PUBLIC.size);
    expect(guarded(layoutLoaders).length).toBeGreaterThan(0);
  });

  it.each(guarded(pageLoaders))("%s sends an anonymous visitor to /signin without reading data", async (_file, load) => {
    const { default: Page } = await load();
    await expect(Promise.resolve().then(() => Page({ children: "" }))).rejects.toThrow("redirect:/signin");
    expect(state.dbTouched).toBe(0);
  });

  it.each(guarded(layoutLoaders))("%s sends an anonymous visitor to /signin", async (_file, load) => {
    const { default: Layout } = await load();
    await expect(Promise.resolve().then(() => Layout({ children: "x" }))).rejects.toThrow("redirect:/signin");
  });

  it("a session without a user id counts as anonymous", async () => {
    state.session = { user: { name: "No id" } };
    await expect(requirePageUser()).rejects.toThrow("redirect:/signin");
  });

  it("returns the signed-in user, with a default name", async () => {
    state.session = { user: { id: "u1", name: "Ana" } };
    await expect(requirePageUser()).resolves.toEqual({ id: "u1", name: "Ana" });
    state.session = { user: { id: "u1", name: null } };
    await expect(requirePageUser()).resolves.toEqual({ id: "u1", name: "User" });
  });

  it("one way: only the shared helper reads the session, no page or layout does", () => {
    for (const [file, source] of Object.entries(sources)) {
      expect(source, file).not.toMatch(/getServerSession|redirect\("\/signin"\)/);
    }
    for (const [file] of guarded(pageLoaders)) expect(sources[file], file).toContain("requirePageUser()");
  });
});
