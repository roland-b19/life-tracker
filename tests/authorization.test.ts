import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  id: "",
  UnauthorizedError: class UnauthorizedError extends Error {},
}));

vi.mock("@/server/auth", () => ({
  UnauthorizedError: authState.UnauthorizedError,
  requireUser: vi.fn(async () => {
    if (!authState.id) throw new authState.UnauthorizedError();
    return authState.id;
  }),
}));

import { db } from "@/server/db";
import { users } from "@/db/schema";
import { GET, POST } from "@/../app/api/weight/route";
import { DELETE } from "@/../app/api/weight/[id]/route";
import { readdirSync } from "node:fs";
import path from "node:path";
import { securityHeaders } from "@/../next.config";

const appOrigin = "http://localhost:3000";
const admin = new Pool({ connectionString: process.env.DATABASE_URL_MIGRATE });

async function seedUser(subject: string) {
  const [user] = await db
    .insert(users)
    .values({ issuer: "test", subject })
    .returning({ id: users.id });
  return user.id;
}

function request(method: string, url: string, body?: unknown) {
  return new Request(url, {
    method,
    headers: body
      ? { "Content-Type": "application/json", Origin: appOrigin, Host: new URL(appOrigin).host }
      : { Origin: appOrigin, Host: new URL(appOrigin).host },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("weight authorization", () => {
  it("keeps every API route in the authorization test table", () => {
    const routeFiles = readdirSync(path.resolve("app/api"), { recursive: true })
      .map(String)
      .filter((file) => file.endsWith("route.ts"))
      .sort();
    expect(routeFiles).toEqual([
      "ai/food/route.ts",
      "auth/[...nextauth]/route.ts",
      "mcp/route.ts",
      "weight/[id]/route.ts",
      "weight/route.ts",
    ]);
  });

  it("defines the security headers", () => {
    const names = new Set(securityHeaders.map((header) => header.key));
    expect(names).toEqual(
      new Set([
        "Content-Security-Policy",
        "Strict-Transport-Security",
        "X-Content-Type-Options",
        "Referrer-Policy",
        "Permissions-Policy",
        "X-Frame-Options",
      ]),
    );
  });

  beforeAll(async () => {
    await admin.query("TRUNCATE TABLE weight_entries, users CASCADE");
  });

  beforeEach(async () => {
    await admin.query("TRUNCATE TABLE weight_entries, users CASCADE");
    authState.id = await seedUser(`a-${randomUUID()}`);
  });

  afterAll(async () => {
    await admin.end();
  });

  it("allows the owner and rejects anonymous requests", async () => {
    const ownerResponse = await POST(
      request("POST", `${appOrigin}/api/weight`, { date: "2026-01-01", kilograms: 80 }),
    );
    expect(ownerResponse.status).toBe(201);

    authState.id = "";
    const anonymousResponse = await GET(request("GET", `${appOrigin}/api/weight`));
    expect(anonymousResponse.status).toBe(401);
  });

  it("does not expose another user's rows or allow their deletion", async () => {
    const ownerId = authState.id;
    const ownerResponse = await POST(
      request("POST", `${appOrigin}/api/weight`, { date: "2026-01-02", kilograms: 81 }),
    );
    const { entry } = (await ownerResponse.json()) as { entry: { id: string } };
    const otherId = await seedUser(`b-${randomUUID()}`);
    authState.id = otherId;

    const listResponse = await GET(request("GET", `${appOrigin}/api/weight`));
    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toEqual({ entries: [] });

    const deleteResponse = await DELETE(request("DELETE", `${appOrigin}/api/weight/${entry.id}`, {}), {
      params: Promise.resolve({ id: entry.id }),
    });
    expect(deleteResponse.status).toBe(404);
    authState.id = ownerId;
  });

  it("rejects mass assignment, invalid values and duplicate dates", async () => {
    const body = { date: "2026-01-03", kilograms: 82, user_id: randomUUID() };
    expect((await POST(request("POST", `${appOrigin}/api/weight`, body))).status).toBe(400);
    expect(
      (await POST(request("POST", `${appOrigin}/api/weight`, { date: "2026-01-03", kilograms: 82 }))).status,
    ).toBe(201);
    expect(
      (await POST(request("POST", `${appOrigin}/api/weight`, { date: "2026-01-03", kilograms: 82 }))).status,
    ).toBe(409);
  });
});
