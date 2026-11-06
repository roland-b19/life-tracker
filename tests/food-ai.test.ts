import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { db } from "@/server/db";
import { users } from "@/db/schema";
import {
  generateApiToken,
  listApiTokens,
  revokeApiToken,
  verifyApiToken,
} from "@/lib/api-tokens";
import { executeFoodAiTool } from "@/lib/food-ai-tools";
import { POST as mcpPost } from "../app/api/mcp/route";
import { GET as geminiGet, POST as geminiPost } from "../app/api/ai/food/route";

const admin = new Pool({ connectionString: process.env.DATABASE_URL_MIGRATE });

async function seedUser(subject: string) {
  const [user] = await db
    .insert(users)
    .values({ issuer: "test", subject })
    .returning({ id: users.id });
  return user.id;
}

describe("Food AI Connector: MCP & Gemini Protocols, Authorization & Strict Quarantine", () => {
  let userA: string;
  let userB: string;

  beforeAll(async () => {
    await admin.query(
      "TRUNCATE TABLE api_tokens, shopping_items, meals, nutrition_targets, users CASCADE",
    );
  });

  beforeEach(async () => {
    await admin.query(
      "TRUNCATE TABLE api_tokens, shopping_items, meals, nutrition_targets, users CASCADE",
    );
    userA = await seedUser(`user-a-${randomUUID()}`);
    userB = await seedUser(`user-b-${randomUUID()}`);
  });

  afterAll(async () => {
    await admin.end();
  });

  it("generates, verifies, and revokes scoped API tokens securely", async () => {
    const tokenData = await generateApiToken(userA, "Claude Desktop");
    expect(tokenData.plaintextToken).toMatch(/^lt_food_[a-f0-9]{48}$/);
    expect(tokenData.scope).toBe("food");

    // Verify valid token
    const verifiedId = await verifyApiToken(tokenData.plaintextToken);
    expect(verifiedId).toBe(userA);

    // List tokens
    const tokens = await listApiTokens(userA);
    expect(tokens).toHaveLength(1);
    expect(tokens[0].name).toBe("Claude Desktop");

    // Revoke token
    const revoked = await revokeApiToken(userA, tokenData.id);
    expect(revoked).toBe(true);

    // After revocation, verification fails
    const verifyAfter = await verifyApiToken(tokenData.plaintextToken);
    expect(verifyAfter).toBeNull();
  });

  it("enforces kill switch when AI_CONNECTOR_ENABLED is false", async () => {
    const tokenData = await generateApiToken(userA);
    process.env.AI_CONNECTOR_ENABLED = "false";

    await expect(verifyApiToken(tokenData.plaintextToken)).rejects.toThrow(
      "AI Connector is temporarily disabled",
    );

    process.env.AI_CONNECTOR_ENABLED = "true";
    const verified = await verifyApiToken(tokenData.plaintextToken);
    expect(verified).toBe(userA);
  });

  it("MCP endpoint rejects unauthenticated calls and validates initialize/tools methods", async () => {
    const tokenData = await generateApiToken(userA);

    // 1. Unauthenticated call -> 401
    const unauthReq = new NextRequest("http://localhost:3000/api/mcp", {
      method: "POST",
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    const unauthRes = await mcpPost(unauthReq);
    expect(unauthRes.status).toBe(401);

    // 2. Initialize handshake with Bearer token
    const initReq = new NextRequest("http://localhost:3000/api/mcp", {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokenData.plaintextToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    });
    const initRes = await mcpPost(initReq);
    expect(initRes.status).toBe(200);
    const initBody = await initRes.json();
    expect(initBody.result.serverInfo.name).toBe("life-tracker-food");

    // 3. tools/list returns exclusively food tools
    const listReq = new NextRequest("http://localhost:3000/api/mcp", {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokenData.plaintextToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
    });
    const listRes = await mcpPost(listReq);
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    const toolNames = listBody.result.tools.map((t: { name: string }) => t.name);

    expect(toolNames).toContain("log_meal");
    expect(toolNames).toContain("get_daily_food_summary");
    expect(toolNames).toContain("get_recipes");
    expect(toolNames).toContain("add_shopping_item");

    // Strict quarantine check: ensure no other sensitive modules leak
    expect(toolNames.some((n: string) => n.includes("weight"))).toBe(false);
    expect(toolNames.some((n: string) => n.includes("step"))).toBe(false);
    expect(toolNames.some((n: string) => n.includes("money"))).toBe(false);
    expect(toolNames.some((n: string) => n.includes("expense"))).toBe(false);
    expect(toolNames.some((n: string) => n.includes("workout"))).toBe(false);
    expect(toolNames.some((n: string) => n.includes("gym"))).toBe(false);
    expect(toolNames.some((n: string) => n.includes("todo"))).toBe(false);
  });

  it("MCP tools/call logs meal with isEstimated flag and updates daily nutrition totals", async () => {
    const tokenData = await generateApiToken(userA);

    const callReq = new NextRequest("http://localhost:3000/api/mcp", {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokenData.plaintextToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "log_meal",
          arguments: {
            date: "2026-11-04",
            name: "AI Estimated Grilled Salmon with Rice",
            calories: 650,
            protein: 50,
            carbs: 60,
            fat: 20,
          },
        },
      }),
    });

    const callRes = await mcpPost(callReq);
    expect(callRes.status).toBe(200);
    const callBody = await callRes.json();
    expect(callBody.result.isError).toBe(false);

    const parsedContent = JSON.parse(callBody.result.content[0].text);
    expect(parsedContent.success).toBe(true);
    expect(parsedContent.meal.isEstimated).toBe(true);
    expect(parsedContent.meal.name).toBe("AI Estimated Grilled Salmon with Rice");
  });

  it("strictly enforces AI quarantine on get_daily_food_summary (no weight, no steps)", async () => {
    const res = (await executeFoodAiTool(userA, "get_daily_food_summary", {
      date: "2026-11-04",
    })) as {
      success: boolean;
      targets?: { calories: number };
      consumed?: { calories: number; steps?: number };
      [key: string]: unknown;
    };

    expect(res.success).toBe(true);
    expect(res.targets?.calories).toBe(3350);
    expect(res.consumed?.calories).toBe(0);

    // Verify weight and steps are not returned in the AI payload
    expect("weight" in res).toBe(false);
    expect("bodyWeight" in res).toBe(false);
    expect(res.consumed && "steps" in res.consumed).toBe(false);
  });

  it("defaults to today's date if date is omitted in log_meal and get_daily_food_summary", async () => {
    const today = new Date().toISOString().slice(0, 10);

    const mealRes = (await executeFoodAiTool(userA, "log_meal", {
      name: "Apple & Almonds",
      calories: 220,
      protein: 5,
      carbs: 28,
      fat: 10,
    })) as { success: boolean; meal: { date: string } };

    expect(mealRes.success).toBe(true);
    expect(mealRes.meal.date).toBe(today);

    const summaryRes = (await executeFoodAiTool(userA, "get_daily_food_summary", {})) as {
      success: boolean;
      date: string;
    };
    expect(summaryRes.success).toBe(true);
    expect(summaryRes.date).toBe(today);
  });

  it("Gemini Function Calling API routes function declarations and executes tools", async () => {
    const tokenData = await generateApiToken(userA);

    // 1. GET returns Google Tool Declarations
    const schemaRes = await geminiGet();
    expect(schemaRes.status).toBe(200);
    const schemaBody = await schemaRes.json();
    expect(schemaBody.status).toBe("active");
    expect(schemaBody.tools.functionDeclarations).toHaveLength(4);

    // 2. POST executes Google Function Call
    const callReq = new NextRequest("http://localhost:3000/api/ai/food", {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokenData.plaintextToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        functionCall: {
          name: "add_shopping_item",
          args: {
            name: "Greek Yogurt 0%",
            amount: 2,
            unit: "pots",
            category: "dairy",
          },
        },
      }),
    });

    const callRes = await geminiPost(callReq);
    expect(callRes.status).toBe(200);
    const callBody = await callRes.json();
    expect(callBody.success).toBe(true);
    expect(callBody.functionResponse.name).toBe("add_shopping_item");
    expect(callBody.functionResponse.response.item.name).toBe("Greek Yogurt 0%");
  });

  it("enforces multi-user isolation on AI connector", async () => {
    const tokenA = await generateApiToken(userA);
    const tokenB = await generateApiToken(userB);

    // User A logs a meal via AI over HTTP with tokenA
    const reqA = new NextRequest("http://localhost:3000/api/ai/food", {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokenA.plaintextToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "log_meal",
        args: {
          date: "2026-11-04",
          name: "User A Oatmeal",
          calories: 400,
          protein: 25,
          carbs: 60,
          fat: 6,
        },
      }),
    });
    const resA = await geminiPost(reqA);
    expect(resA.status).toBe(200);

    // User B queries daily summary via AI over HTTP with tokenB
    const reqB = new NextRequest("http://localhost:3000/api/ai/food", {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokenB.plaintextToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "get_daily_food_summary",
        args: { date: "2026-11-04" },
      }),
    });
    const resB = await geminiPost(reqB);
    expect(resB.status).toBe(200);
    const summaryB = (await resB.json()) as {
      functionResponse: {
        name: string;
        response: {
          mealsCount: number;
          consumed: { calories: number };
        };
      };
    };

    expect(summaryB.functionResponse.response.mealsCount).toBe(0);
    expect(summaryB.functionResponse.response.consumed.calories).toBe(0);
  });

  it("rejects unauthorized tool execution and invalid parameter ranges", async () => {
    // Unknown or forbidden tool
    await expect(
      executeFoodAiTool(userA, "get_bank_balance", {}),
    ).rejects.toThrow("The AI connector only has access to food tools.");

    // Negative calories
    await expect(
      executeFoodAiTool(userA, "log_meal", {
        date: "2026-11-04",
        name: "Junk",
        calories: -50,
        protein: 10,
        carbs: 10,
        fat: 10,
      }),
    ).rejects.toThrow();

    // Excessive calories (>10000)
    await expect(
      executeFoodAiTool(userA, "log_meal", {
        date: "2026-11-04",
        name: "Huge Meal",
        calories: 15000,
        protein: 10,
        carbs: 10,
        fat: 10,
      }),
    ).rejects.toThrow();
  });
});
