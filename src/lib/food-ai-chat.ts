import { executeFoodAiTool, FOOD_GEMINI_TOOLS } from "./food-ai-tools";

export interface ChatMessage {
  role: "user" | "model";
  text: string;
}

export async function sendFoodChatMessage(
  userId: string,
  message: string,
  history: ChatMessage[] = [],
): Promise<{
  reply: string;
  toolExecuted?: {
    name: string;
    args: Record<string, unknown>;
    result: Record<string, unknown>;
  };
}> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return {
      reply:
        "Pentru a activa chat-ul inteligent cu Gemini direct în aplicație, te rog să adaugi variabila `GEMINI_API_KEY` în fișierul `.env` (poți genera o cheie gratuită la https://aistudio.google.com). Odată adăugată, voi putea estima automat caloriile și înregistra mesele direct din conversație!",
    };
  }

  const systemInstruction = {
    parts: [
      {
        text: `You are Life Tracker's Food AI Assistant.
Your ONLY responsibility is to assist the user with nutrition, food logs, meal planning, saved recipes, and shopping lists.
You have access to 4 food tools: log_meal, get_daily_food_summary, get_recipes, add_shopping_item.

STRICT SECURITY & PRIVACY QUARANTINE RULES:
1. You have access ONLY to food tools. You NEVER have access to body weight, weigh-in history, steps, gym workouts, bank accounts, money/expenses, daily habits, or personal tasks.
2. If the user asks about weight, workouts, money, or tasks, politely refuse and state that your access is strictly quarantined to food and nutrition only.
3. When the user tells you in natural language (Romanian, English, etc.) what they ate or drank (e.g. "am mancat 2 felii de pizza la pranz", "omleta din 3 oua cu telemea si o cafea"):
   - Estimate realistic calories, protein, carbs, and fat in grams.
   - Determine the mealType (breakfast, lunch, dinner, snack).
   - Pick a concise, clean meal name.
   - Call the log_meal function immediately.
4. When the user asks about recipes, call get_recipes.
5. When the user asks about daily calories, remaining macros, or today's food summary, call get_daily_food_summary.
6. When the user asks to add an ingredient or item to their shopping list, call add_shopping_item.
7. Always respond in the language the user speaks (Romanian if user writes in Romanian, English if in English). Keep answers helpful, warm, and concise.`,
      },
    ],
  };

  const contents = [
    ...history.map((msg) => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.text }],
    })),
    {
      role: "user",
      parts: [{ text: message }],
    },
  ];

  const tools = [
    {
      functionDeclarations: FOOD_GEMINI_TOOLS.functionDeclarations,
    },
  ];

  const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    // 1. Initial request to Gemini
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction,
        contents,
        tools,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, errorText);
      return {
        reply: `Eroare de comunicare cu Gemini API (Status ${response.status}). Te rog să verifici cheia GEMINI_API_KEY din .env.`,
      };
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    const parts = (candidate?.content?.parts as Array<{
      text?: string;
      functionCall?: { name: string; args: Record<string, unknown> };
    }>) || [];

    const functionCallPart = parts.find((p) => p.functionCall);

    if (functionCallPart?.functionCall) {
      const { name, args } = functionCallPart.functionCall;

      // Execute tool under strict quarantine
      let toolResult: Record<string, unknown>;
      try {
        toolResult = await executeFoodAiTool(userId, name, args || {});
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Tool execution failed";
        toolResult = { error: errorMsg };
      }

      // 2. Send functionResponse back to Gemini for natural language response
      const followUpContents = [
        ...contents,
        {
          role: "model",
          parts: [{ functionCall: { name, args: args || {} } }],
        },
        {
          role: "user",
          parts: [
            {
              functionResponse: {
                name,
                response: toolResult,
              },
            },
          ],
        },
      ];

      const followUpResponse = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction,
          contents: followUpContents,
          tools,
        }),
      });

      let finalReply = "";
      if (followUpResponse.ok) {
        const followUpData = await followUpResponse.json();
        finalReply =
          followUpData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      }

      if (!finalReply) {
        finalReply =
          (toolResult.message as string) ||
          `Am înregistrat cu succes operațiunea ${name}.`;
      }

      return {
        reply: finalReply,
        toolExecuted: {
          name,
          args: args || {},
          result: toolResult,
        },
      };
    }

    // Pure conversational reply
    const textReply = parts.map((p) => p.text || "").join("").trim();
    return {
      reply: textReply || "Nu am putut genera un răspuns. Te rog să reîncerci.",
    };
  } catch (err) {
    console.error("Gemini network error:", err);
    return {
      reply: "Nu m-am putut conecta la Gemini API. Te rog să verifici conexiunea la internet.",
    };
  }
}

