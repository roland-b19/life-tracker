import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  id: "",
  UnauthorizedError: class UnauthorizedError extends Error {
    constructor() {
      super("Authentication required.");
      this.name = "UnauthorizedError";
    }
  },
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
import { buildFoodChatPrompt, sendFoodChatMessage } from "@/lib/food-ai-chat";
import { sendFoodChatMessageAction } from "@/app/actions/food-chat";
import { getDailyFoodSummary, getPastFoods, logMeal, updateDailySteps } from "@/lib/food";

async function seedUser(subject: string) {
  const [user] = await db.insert(users).values({ issuer: "test", subject }).returning({ id: users.id });
  return user.id;
}

/** One Gemini response whose text part is `answer` (an object is sent as JSON). */
function mockGemini(answer: unknown) {
  const text = typeof answer === "string" ? answer : JSON.stringify(answer);
  return vi.spyOn(global, "fetch").mockResolvedValueOnce({
    ok: true,
    json: async () => ({ candidates: [{ content: { role: "model", parts: [{ text }] } }] }),
  } as unknown as Response);
}

const ctx = { date: "2026-11-05", time: "13:10" };

describe("Food assistant: context prompt and structured answer", () => {
  let userId: string;
  const originalKey = process.env.GEMINI_API_KEY;

  beforeAll(async () => {
    userId = await seedUser(`chat-user-${randomUUID()}`);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    authState.id = "";
    if (originalKey) process.env.GEMINI_API_KEY = originalKey;
    else delete process.env.GEMINI_API_KEY;
  });

  it("returns setup instructions if GEMINI_API_KEY is not configured", async () => {
    delete process.env.GEMINI_API_KEY;
    const result = await sendFoodChatMessage(userId, "Am mancat o banana", [], ctx);
    expect(result.reply).toContain("GEMINI_API_KEY");
    expect(result.meals).toEqual([]);
  });

  it("logs each valid meal from the JSON answer as an estimate, and drops invalid ones", async () => {
    process.env.GEMINI_API_KEY = "mock-gemini-key";
    const fetchMock = mockGemini({
      reply: "Am adăugat prânzul.",
      meals: [
        { name: "200 g somon la grătar", calories: 412.6, protein: 40, carbs: 0, fat: 26 },
        { name: "", calories: 50, protein: 1, carbs: 10, fat: 0 }, // empty name: rejected
      ],
    });

    const result = await sendFoodChatMessage(userId, "La prânz am mâncat 200 g somon", [], ctx);

    expect(result.reply).toBe("Am adăugat prânzul.");
    expect(result.meals).toHaveLength(1);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.contents.at(-1).parts[0].text).toBe("La prânz am mâncat 200 g somon");

    const summary = await getDailyFoodSummary(userId, ctx.date);
    const meal = summary.meals.find((m) => m.name === "200 g somon la grătar");
    expect(meal?.calories).toBe(413);
    expect(meal?.isEstimated).toBe(true);
  });

  it("logs nothing when the answer is not valid JSON", async () => {
    process.env.GEMINI_API_KEY = "mock-gemini-key";
    mockGemini("Sure! I logged your pizza.");
    const before = (await getDailyFoodSummary(userId, ctx.date)).meals.length;

    const result = await sendFoodChatMessage(userId, "2 felii de pizza", [], ctx);

    expect(result.meals).toEqual([]);
    expect((await getDailyFoodSummary(userId, ctx.date)).meals).toHaveLength(before);
  });

  it("puts food context in the prompt, never steps or weight", async () => {
    const other = await seedUser(`chat-prompt-${randomUUID()}`);
    await logMeal(other, { date: ctx.date, name: "Ovăz cu lapte", calories: 350, protein: 12, carbs: 55, fat: 8 });
    await updateDailySteps(other, ctx.date, 98765);

    const prompt = await buildFoodChatPrompt(other, ctx);

    expect(prompt).toContain("2026-11-05 (Thursday)");
    expect(prompt).toContain("13:10");
    expect(prompt).toContain("Ovăz cu lapte, 350 kcal");
    expect(prompt).not.toContain("98765");
    expect(prompt).not.toMatch(/steps|weight/i);
  });

  it("lists past foods once per name, newest first, only the owner's", async () => {
    const owner = await seedUser(`past-foods-${randomUUID()}`);
    const stranger = await seedUser(`past-foods-${randomUUID()}`);
    await logMeal(owner, { date: "2026-11-01", name: "Banana", calories: 90, protein: 1, carbs: 23, fat: 0 });
    await logMeal(owner, { date: "2026-11-02", name: "Ciorbă de pui", calories: 300, protein: 20, carbs: 25, fat: 10 });
    await logMeal(owner, { date: "2026-11-03", name: "banana", calories: 100, protein: 1, carbs: 25, fat: 0 });
    await logMeal(stranger, { date: "2026-11-03", name: "Secret", calories: 1, protein: 0, carbs: 0, fat: 0 });

    const foods = await getPastFoods(owner);

    expect(foods.map((f) => f.name)).toEqual(["banana", "Ciorbă de pui"]);
    expect(foods[0].calories).toBe(100);
  });

  describe("sendFoodChatMessageAction", () => {
    const input = { message: "o banană", history: [], date: ctx.date, time: ctx.time };

    it("rejects anonymous requests", async () => {
      await expect(sendFoodChatMessageAction(input)).rejects.toThrow("Authentication required.");
    });

    it("logs meals only for the signed-in owner", async () => {
      const owner = await seedUser(`chat-owner-${randomUUID()}`);
      const stranger = await seedUser(`chat-stranger-${randomUUID()}`);
      process.env.GEMINI_API_KEY = "mock-gemini-key";
      mockGemini({ reply: "Gata.", meals: [{ name: "1 banană", calories: 105, protein: 1.3, carbs: 27, fat: 0.4 }] });
      authState.id = owner;

      const res = await sendFoodChatMessageAction(input);

      expect(res.meals).toHaveLength(1);
      expect(res.freshSummary?.meals.map((m) => m.name)).toEqual(["1 banană"]);
      expect((await getDailyFoodSummary(stranger, ctx.date)).meals).toHaveLength(0);
    });

    it("rejects invalid input before calling the model", async () => {
      authState.id = userId;
      const fetchMock = vi.spyOn(global, "fetch");
      await expect(sendFoodChatMessageAction({ ...input, message: "   " })).rejects.toThrow();
      await expect(sendFoodChatMessageAction({ ...input, time: "25:00" })).rejects.toThrow();
      await expect(sendFoodChatMessageAction({ ...input, message: "x".repeat(1001) })).rejects.toThrow();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
