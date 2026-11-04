import { NextRequest, NextResponse } from "next/server";
import { verifyApiToken } from "@/lib/api-tokens";
import { executeFoodAiTool, FOOD_GEMINI_TOOLS } from "@/lib/food-ai-tools";

function extractBearerToken(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  const apiKeyHeader = req.headers.get("x-api-key");
  if (apiKeyHeader) {
    return apiKeyHeader.trim();
  }
  return null;
}

// GET returns the Gemini Function Declarations tool schema
export async function GET() {
  return NextResponse.json({
    status: "active",
    connector: "Gemini Food Assistant",
    tools: FOOD_GEMINI_TOOLS,
  });
}

// POST executes a tool call from Gemini / custom agent
export async function POST(req: NextRequest) {
  const token = extractBearerToken(req);
  if (!token) {
    return NextResponse.json(
      { error: "Authentication required. Pass Bearer token or x-api-key header." },
      { status: 401 },
    );
  }

  let userId: string | null;
  try {
    userId = await verifyApiToken(token);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Authentication failed";
    return NextResponse.json({ error: msg }, { status: 403 });
  }

  if (!userId) {
    return NextResponse.json(
      { error: "Invalid or expired Food API token." },
      { status: 401 },
    );
  }

  let body: {
    toolName?: string;
    name?: string;
    args?: Record<string, unknown>;
    arguments?: Record<string, unknown>;
    functionCall?: { name: string; args: Record<string, unknown> };
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body." },
      { status: 400 },
    );
  }

  // Support both standard format and Google functionCall wrapper format
  const toolName = body.functionCall?.name || body.toolName || body.name;
  const args = body.functionCall?.args || body.args || body.arguments || {};

  if (!toolName) {
    return NextResponse.json(
      { error: "Missing toolName or functionCall.name in request." },
      { status: 400 },
    );
  }

  try {
    const result = await executeFoodAiTool(userId, toolName, args);
    return NextResponse.json({
      success: true,
      functionResponse: {
        name: toolName,
        response: result,
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Execution failed";
    return NextResponse.json(
      {
        success: false,
        error: errorMsg,
      },
      { status: 400 },
    );
  }
}
