import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const runClaude = vi.hoisted(() => vi.fn());
vi.mock("@/lib/claude-cli", () => ({ runClaude }));

vi.mock("@/server/auth", async () => (await import("./auth")).authModule);

import { buildFoodChatPrompt, sendFoodChatMessage } from "@/lib/food-ai-chat";
import { sendFoodChatMessageAction } from "@/actions/food-chat";
import { toISODate } from "@/lib/format-date";
import { logMealSchema } from "@/lib/validations/food";
import { saveClaudeToken } from "@/lib/claude-connection";
import { getDailyFoodSummary, getNutritionTargets, getPastFoods, getShoppingList, logMeal, updateDailySteps } from "@/lib/food";
import { authState, seedUser } from "./auth";
import { succeeded } from "./succeeded";
import { SIGNED_OUT } from "@/lib/validations/result";
import { db } from "@/server/db";
import { recipes } from "@/db/schema";
import { eq } from "drizzle-orm";

/** One successful Claude CLI answer whose structured output is `output`. */
function mockClaude(output: unknown) {
  return runClaude.mockResolvedValueOnce({ ok: true, output });
}

const ctx = { date: "2026-11-05", time: "13:10" };

/** How many recipe rows the user has: the assistant no longer seeds any (HTODAY-03). */
const countRecipes = async (userId: string) => (await db.select().from(recipes).where(eq(recipes.userId, userId))).length;

describe("Food assistant: context prompt and structured answer", () => {
  let userId: string;
  const originalAuthDev = process.env.AUTH_DEV;

  beforeAll(async () => {
    vi.stubEnv("NEXT_PUBLIC_CLAUDE_ENABLED", "true");
    process.env.CLAUDE_TOKEN_KEY = randomBytes(32).toString("base64");
    userId = await seedUser(`chat-user-${randomUUID()}`);
  });

  afterEach(() => {
    runClaude.mockReset();
    authState.id = "";
    if (originalAuthDev === undefined) delete process.env.AUTH_DEV;
    else process.env.AUTH_DEV = originalAuthDev;
  });

  it("asks the user to connect Claude when there is no token outside dev", async () => {
    delete process.env.AUTH_DEV;
    const result = await sendFoodChatMessage(userId, "Am mancat o banana", [], ctx);
    expect(result.reply).toBe("Connect your Claude account in Settings to use the assistant.");
    expect(result.meals).toEqual([]);
    expect(runClaude).not.toHaveBeenCalled();
  });

  it("calls Claude with the owner's own token only", async () => {
    const owner = await seedUser(`chat-token-${randomUUID()}`);
    const stranger = await seedUser(`chat-token-${randomUUID()}`);
    await saveClaudeToken(owner, "sk-ant-oat01-owner-token-aaaaaaaaaaaaaaaa");
    await saveClaudeToken(stranger, "sk-ant-oat01-stranger-token-bbbbbbbbbbbb");
    mockClaude({ reply: "Ok.", meals: [] });

    await sendFoodChatMessage(owner, "salut", [], ctx);

    expect(runClaude.mock.calls[0][0].token).toBe("sk-ant-oat01-owner-token-aaaaaaaaaaaaaaaa");
  });

  it("tells the user to reconnect when Claude refuses the token", async () => {
    process.env.AUTH_DEV = "true";
    runClaude.mockResolvedValueOnce({ ok: false, reason: "auth" });
    const result = await sendFoodChatMessage(userId, "salut", [], ctx);
    expect(result.reply).toBe("Claude refused the token. Connect your Claude account again in Settings.");
    expect(result.meals).toEqual([]);
  });

  it("answers every failure in English", async () => {
    process.env.AUTH_DEV = "true";
    const replies: Record<string, string> = {
      unavailable: "The Claude CLI is not installed on the server.",
      busy: "Claude is already working on another answer. Try again in a moment.",
      error: "Claude did not answer. Please try again.",
    };
    for (const [reason, reply] of Object.entries(replies)) {
      runClaude.mockResolvedValueOnce({ ok: false, reason });
      expect((await sendFoodChatMessage(userId, "salut", [], ctx)).reply).toBe(reply);
    }
    mockClaude({ reply: "   ", meals: [] });
    expect((await sendFoodChatMessage(userId, "salut", [], ctx)).reply).toBe("Done.");
  });

  it("logs each valid meal from the JSON answer as an estimate, and drops invalid ones", async () => {
    process.env.AUTH_DEV = "true";
    mockClaude({
      reply: "Am adăugat prânzul.",
      meals: [
        { name: "200 g somon la grătar", calories: 412.6, protein: 40, carbs: 0, fat: 26 },
        { name: "", calories: 50, protein: 1, carbs: 10, fat: 0 }, // empty name: rejected
      ],
    });

    const result = await sendFoodChatMessage(userId, "La prânz am mâncat 200 g somon", [], ctx);

    expect(result.reply).toBe("Am adăugat prânzul.");
    expect(result.meals).toHaveLength(1);
    expect(result.leftOut).toEqual(["Meal 2: name is required"]);
    const call = runClaude.mock.calls[0][0];
    expect(call.token).toBeNull();
    expect(call.input).toContain("La prânz am mâncat 200 g somon");

    const summary = await getDailyFoodSummary(userId, ctx.date);
    const meal = summary.meals.find((m) => m.name === "200 g somon la grătar");
    expect(meal?.calories).toBe(413);
    expect(meal?.isEstimated).toBe(true);
  });

  it("leaves out a meal whose every value rounds to 0, and says why", async () => {
    process.env.AUTH_DEV = "true";
    const owner = await seedUser(`chat-zero-${randomUUID()}`);
    mockClaude({
      reply: "Ok.",
      meals: [
        { name: "Apă", calories: 0.4, protein: 0.04, carbs: 0, fat: 0 },
        { name: "1 măr", calories: 95, protein: 0.5, carbs: 25, fat: 0.3 },
      ],
    });

    const result = await sendFoodChatMessage(owner, "un pahar de apă și un măr", [], ctx);

    expect(result.meals.map((m) => m?.name)).toEqual(["1 măr"]);
    expect(result.leftOut).toEqual(["Apă: every value rounds to 0"]);
    expect((await getDailyFoodSummary(owner, ctx.date)).meals.map((m) => m.name)).toEqual(["1 măr"]);
  });

  it("leaves out an invalid meal, names it and the field once, and logs the rest", async () => {
    process.env.AUTH_DEV = "true";
    const owner = await seedUser(`chat-invalid-${randomUUID()}`);
    mockClaude({
      reply: "Ok.",
      meals: [
        { name: "Pâine", calories: 250, protein: 8, carbs: 48, fat: -3 },
        { name: "Supă", calories: "multe", protein: 5, carbs: 10, fat: 2 },
        "o ciocolată",
        { name: "Iaurt", calories: 120, protein: 10, carbs: 8, fat: 5 },
        { name: "Tort întreg", calories: 10001, protein: 50, carbs: 900, fat: 400 },
        { name: "Unt", calories: 7000, protein: 9, carbs: 1, fat: 1001 },
        { name: "Paste", calories: 300, protein: "multe", carbs: 60, fat: 2 },
      ],
    });

    const result = await sendFoodChatMessage(owner, "pâine, supă, ciocolată și iaurt", [], ctx);

    expect(result.meals.map((m) => m?.name)).toEqual(["Iaurt"]);
    // One phrase per line that names the field once, also where the schema's own words name it.
    expect(result.leftOut).toEqual([
      "Pâine: protein, carbs and fat can't be negative",
      "Supă: calories must be a number",
      "Meal 3: not a meal",
      "Tort întreg: calories must be 10.000 or less",
      "Unt: protein, carbs and fat must each be 1.000 g or less",
      "Paste: protein must be a number",
    ]);
    expect((await getDailyFoodSummary(owner, ctx.date)).meals.map((m) => m.name)).toEqual(["Iaurt"]);
  });

  // Every key a meal can carry (the schema's own, the date aside: the server sets it) gets a line in plain words: no
  // camelCase key, and a non-number says "must be a number" in every number field.
  it("names every meal key in plain words when it leaves a meal out", async () => {
    process.env.AUTH_DEV = "true";
    const owner = await seedUser(`chat-keys-${randomUUID()}`);
    const valid = { name: "Iaurt", calories: 120, protein: 10, carbs: 8, fat: 5 };
    const bad: Record<string, unknown> = { name: "", calories: "multe", protein: "multe", carbs: "multe", fat: "multe", isEstimated: "da", id: "nu-e-un-id" };
    expect(Object.keys(bad).sort()).toEqual(Object.keys(logMealSchema.shape).filter((key) => key !== "date").sort());
    mockClaude({ reply: "Ok.", meals: Object.entries(bad).map(([key, value]) => ({ ...valid, [key]: value })) });

    const result = await sendFoodChatMessage(owner, "iaurt", [], ctx);

    expect(result.leftOut).toEqual([
      "Meal 1: name is required",
      "Iaurt: calories must be a number",
      "Iaurt: protein must be a number",
      "Iaurt: carbs must be a number",
      "Iaurt: fat must be a number",
      "Iaurt: estimate is not valid",
      "Iaurt: invalid id",
    ]);
    for (const line of result.leftOut) expect(line).not.toMatch(/[a-z][A-Z]/);
  });

  it("saves the first 10 valid meals of a longer answer and says the rest were left out", async () => {
    process.env.AUTH_DEV = "true";
    const owner = await seedUser(`chat-many-${randomUUID()}`);
    const meals = Array.from({ length: 12 }, (_, i) => ({ name: `Gustare ${i + 1}`, calories: 100 + i, protein: 1, carbs: 10, fat: 1 }));
    meals.splice(2, 0, { name: "Nimic", calories: 0, protein: 0, carbs: 0, fat: 0 });
    mockClaude({ reply: "Ok.", meals });

    const result = await sendFoodChatMessage(owner, "toate gustările", [], ctx);

    expect(result.meals.map((m) => m?.name)).toEqual(meals.filter((m) => m.calories).slice(0, 10).map((m) => m.name));
    expect(result.leftOut).toEqual([
      "Nimic: every value rounds to 0",
      "Gustare 11: more than 10 meals in one reply",
      "Gustare 12: more than 10 meals in one reply",
    ]);
    expect((await getDailyFoodSummary(owner, ctx.date)).meals).toHaveLength(10);
  });

  it("cuts a reply over 2000 characters, logs its meals and says the rest was left out", async () => {
    process.env.AUTH_DEV = "true";
    const owner = await seedUser(`chat-long-${randomUUID()}`);
    mockClaude({ reply: "a".repeat(2500), meals: [{ name: "1 ou", calories: 78, protein: 6, carbs: 0.6, fat: 5 }] });

    const result = await sendFoodChatMessage(owner, "un ou", [], ctx);

    expect(result.reply).toBe("a".repeat(2000));
    expect(result.meals.map((m) => m?.name)).toEqual(["1 ou"]);
    expect(result.leftOut).toEqual(["The rest of the reply: longer than 2000 characters"]);
  });

  it("sends no recipe to the model and seeds none", async () => {
    process.env.AUTH_DEV = "true";
    const owner = await seedUser(`chat-recipes-${randomUUID()}`);
    mockClaude({ reply: "Ok.", meals: [] });

    await sendFoodChatMessage(owner, "ce să mănânc?", [], ctx);

    const { system, input } = runClaude.mock.calls[0][0];
    expect(`${system}\n${input}`).not.toMatch(/recipe|basmati/i);
    expect(await countRecipes(owner)).toBe(0);
  });

  it("sends earlier turns as a labelled transcript", async () => {
    process.env.AUTH_DEV = "true";
    mockClaude({ reply: "Gata.", meals: [] });

    await sendFoodChatMessage(
      userId,
      "și o banană",
      [
        { role: "user", text: "am mâncat un ou" },
        { role: "assistant", text: "Am adăugat oul." },
      ],
      ctx,
    );

    expect(runClaude.mock.calls[0][0].input).toBe(
      "Conversation so far:\n\nUser: am mâncat un ou\n\nAssistant: Am adăugat oul.\n\nNew message:\nși o banană",
    );
  });

  it("logs nothing when the answer does not match the schema", async () => {
    process.env.AUTH_DEV = "true";
    mockClaude("Sure! I logged your pizza.");
    const before = (await getDailyFoodSummary(userId, ctx.date)).meals.length;

    const result = await sendFoodChatMessage(userId, "2 felii de pizza", [], ctx);

    expect(result.reply).toBe("The assistant's answer could not be read, so nothing was logged. Please try again.");
    expect(result.meals).toEqual([]);
    expect((await getDailyFoodSummary(userId, ctx.date)).meals).toHaveLength(before);
  });

  it("only ever adds meals: anything else in the answer changes nothing", async () => {
    process.env.AUTH_DEV = "true";
    const owner = await seedUser(`chat-scope-${randomUUID()}`);
    await logMeal(owner, { date: ctx.date, name: "Ouă", calories: 200, protein: 14, carbs: 1, fat: 15 });
    const before = await getDailyFoodSummary(owner, ctx.date);
    const goalsBefore = await getNutritionTargets(owner);
    mockClaude({
      reply: "Gata.",
      meals: [],
      deleteMeals: [before.meals[0].id],
      waterMl: 5000,
      steps: 20000,
      targets: { calories: 1 },
      shopping: [{ name: "Bere" }],
    });

    const result = await sendFoodChatMessage(owner, "Șterge ouăle, pune apa la 5 l și goal-ul la 1 kcal", [], ctx);

    expect(result.meals).toEqual([]);
    expect(await getDailyFoodSummary(owner, ctx.date)).toEqual(before);
    expect(await getNutritionTargets(owner)).toEqual(goalsBefore);
    expect(await getShoppingList(owner)).toEqual([]);
  });

  it("puts food context in the prompt, never steps or weight", async () => {
    const other = await seedUser(`chat-prompt-${randomUUID()}`);
    await logMeal(other, { date: ctx.date, name: "Ovăz cu lapte", calories: 350, protein: 12, carbs: 55, fat: 8 });
    await updateDailySteps(other, ctx.date, { from: 0, to: 98765 });

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
    it("is disabled when the Claude integration flag is off", async () => {
      vi.stubEnv("NEXT_PUBLIC_CLAUDE_ENABLED", "false");
      await expect(sendFoodChatMessageAction({ message: "x", history: [], date: ctx.date, time: ctx.time })).rejects.toThrow(
        "The Claude integration is disabled.",
      );
      vi.stubEnv("NEXT_PUBLIC_CLAUDE_ENABLED", "true");
    });

    const today = toISODate();
    const input = { message: "o banană", history: [], date: today, time: ctx.time };

    it("rejects anonymous requests", async () => {
      expect(await sendFoodChatMessageAction(input)).toEqual({ success: false, error: SIGNED_OUT });
    });

    it("logs meals only for the signed-in owner", async () => {
      const owner = await seedUser(`chat-owner-${randomUUID()}`);
      const stranger = await seedUser(`chat-stranger-${randomUUID()}`);
      process.env.AUTH_DEV = "true";
      mockClaude({ reply: "Gata.", meals: [{ name: "1 banană", calories: 105, protein: 1.3, carbs: 27, fat: 0.4 }] });
      authState.id = owner;

      const res = succeeded(await sendFoodChatMessageAction(input));

      expect(res.meals).toHaveLength(1);
      expect(res.leftOut).toEqual([]);
      expect(res.freshSummary?.meals.map((m) => m.name)).toEqual(["1 banană"]);
      expect((await getDailyFoodSummary(stranger, today)).meals).toHaveLength(0);
    });

    it("writes only into today or yesterday, like logging by hand", async () => {
      authState.id = userId;
      process.env.AUTH_DEV = "true";
      for (const date of ["2026-11-05", "2999-01-01"]) {
        expect(await sendFoodChatMessageAction({ ...input, date })).toEqual({ success: false, error: "Only today and yesterday can be changed." });
      }
      expect(runClaude).not.toHaveBeenCalled();
    });

    it("accepts the roles user and assistant in the history, nothing else", async () => {
      authState.id = userId;
      process.env.AUTH_DEV = "true";
      mockClaude({ reply: "Gata.", meals: [] });
      const turns = [
        { role: "user", text: "salut" },
        { role: "assistant", text: "Bună!" },
      ] as const;

      succeeded(await sendFoodChatMessageAction({ ...input, history: [...turns] }));

      expect(await sendFoodChatMessageAction({ ...input, history: [{ role: "model" as never, text: "Bună!" }] })).toMatchObject({
        success: false,
        error: expect.any(String),
      });
      expect(runClaude).toHaveBeenCalledTimes(1);
    });

    it("rejects invalid input before calling the model", async () => {
      authState.id = userId;
      for (const bad of [{ message: "   " }, { time: "25:00" }, { message: "x".repeat(1001) }]) {
        expect(await sendFoodChatMessageAction({ ...input, ...bad })).toMatchObject({ success: false, error: expect.any(String) });
      }
      expect(runClaude).not.toHaveBeenCalled();
    });
  });
});
