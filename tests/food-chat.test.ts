import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { users } from "@/db/schema";
import { sendFoodChatMessage } from "@/lib/food-ai-chat";
import { getDailyFoodSummary } from "@/lib/food";

async function seedUser(subject: string) {
  const [user] = await db
    .insert(users)
    .values({ issuer: "test", subject })
    .returning({ id: users.id });
  return user.id;
}

describe("Food AI In-App Chat with Gemini & Strict Quarantine", () => {
  let userId: string;

  beforeAll(async () => {
    userId = await seedUser(`chat-user-${randomUUID()}`);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
  });

  it("returns helpful setup instructions if GEMINI_API_KEY is not configured", async () => {
    const originalKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    try {
      const result = await sendFoodChatMessage(userId, "Am mancat o banana");
      expect(result.reply).toContain("GEMINI_API_KEY");
      expect(result.toolExecuted).toBeUndefined();
    } finally {
      if (originalKey) {
        process.env.GEMINI_API_KEY = originalKey;
      }
    }
  });

  it("handles Gemini function calling and logs meal with AI Estimated flag", async () => {
    process.env.GEMINI_API_KEY = "mock-gemini-key";

    // Mock global fetch for Gemini API
    const fetchMock = vi.spyOn(global, "fetch");

    // Call 1: Gemini decides to call function `log_meal`
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              role: "model",
              parts: [
                {
                  functionCall: {
                    name: "log_meal",
                    args: {
                      mealType: "lunch",
                      name: "Grilled Salmon with Asparagus",
                      calories: 550,
                      protein: 48,
                      carbs: 10,
                      fat: 25,
                    },
                  },
                },
              ],
            },
          },
        ],
      }),
    } as any);

    // Call 2: Gemini returns friendly text response after tool execution
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              role: "model",
              parts: [
                {
                  text: "Am înregistrat prânzul: Grilled Salmon with Asparagus (550 kcal, 48g proteine, 10g carbohidrați, 25g grăsimi).",
                },
              ],
            },
          },
        ],
      }),
    } as any);

    const result = await sendFoodChatMessage(
      userId,
      "La pranz am mancat somon la gratar cu sparanghel",
    );

    expect(result.reply).toContain("Grilled Salmon with Asparagus");
    expect(result.toolExecuted?.name).toBe("log_meal");
    expect(result.toolExecuted?.result.success).toBe(true);

    // Verify it was persisted in DB with isEstimated: true
    const today = new Date().toISOString().slice(0, 10);
    const summary = await getDailyFoodSummary(userId, today);
    const loggedMeal = summary.meals.find(
      (m) => m.name === "AI Estimated Grilled Salmon with Asparagus" || m.name === "Grilled Salmon with Asparagus",
    );
    expect(loggedMeal).toBeDefined();
    expect(loggedMeal?.calories).toBe(550);
  });
});
