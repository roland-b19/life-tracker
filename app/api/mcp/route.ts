import { NextRequest, NextResponse } from "next/server";
import { verifyApiToken } from "@/lib/api-tokens";
import { executeFoodAiTool, FOOD_MCP_TOOLS } from "@/lib/food-ai-tools";

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

export async function POST(req: NextRequest) {
  const token = extractBearerToken(req);
  if (!token) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: { code: -32001, message: "Authentication required. Provide Bearer token or x-api-key header." },
        id: null,
      },
      { status: 401 },
    );
  }

  let userId: string | null;
  try {
    userId = await verifyApiToken(token);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Authentication failed";
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32003, message: msg }, id: null },
      { status: 403 },
    );
  }

  if (!userId) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: { code: -32001, message: "Invalid or expired Food API token." },
        id: null,
      },
      { status: 401 },
    );
  }

  let body: { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: { code: -32700, message: "Parse error: Invalid JSON." },
        id: null,
      },
      { status: 400 },
    );
  }

  const { id = 1, method, params = {} } = body;

  switch (method) {
    case "initialize": {
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          serverInfo: {
            name: "life-tracker-food",
            version: "1.0.0",
          },
          capabilities: {
            tools: {},
          },
        },
      });
    }

    case "tools/list": {
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: {
          tools: FOOD_MCP_TOOLS,
        },
      });
    }

    case "tools/call": {
      const toolName = String(params.name ?? "");
      const args = (params.arguments as Record<string, unknown>) ?? {};

      try {
        const executionResult = await executeFoodAiTool(userId, toolName, args);
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(executionResult, null, 2),
              },
            ],
            isError: false,
          },
        });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : "Execution failed";
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: `Error executing tool '${toolName}': ${errorMsg}`,
              },
            ],
            isError: true,
          },
        });
      }
    }

    default: {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id,
          error: {
            code: -32601,
            message: `Method '${method}' not found. Supported methods: initialize, tools/list, tools/call.`,
          },
        },
        { status: 404 },
      );
    }
  }
}

export async function GET(req: NextRequest) {
  // Helpful endpoint for client handshakes or inspection
  const token = extractBearerToken(req);
  if (!token) {
    return NextResponse.json(
      {
        name: "life-tracker-food-mcp",
        status: "active",
        authRequired: true,
        message: "Provide Bearer token to inspect tools.",
      },
      { status: 401 },
    );
  }

  const userId = await verifyApiToken(token);
  if (!userId) {
    return NextResponse.json(
      { error: "Invalid token" },
      { status: 401 },
    );
  }

  return NextResponse.json({
    name: "life-tracker-food-mcp",
    tools: FOOD_MCP_TOOLS,
  });
}
