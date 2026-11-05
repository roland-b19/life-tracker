import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/server/auth";
import { removeWeightEntry } from "@/server/weight";
import { logRequest } from "@/server/logger";
import { isSameOrigin } from "@/server/same-origin";

export const runtime = "nodejs";

function genericError(request: Request, status: number) {
  logRequest(request, "/api/weight/[id]", status);
  const response = NextResponse.json({ error: "Request could not be completed." }, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") {
    return genericError(request, 415);
  }
  if (!isSameOrigin(request)) return genericError(request, 403);

  try {
    const userId = await requireUser();
    const { id } = await context.params;
    const entry = await removeWeightEntry(userId, id);
    if (!entry) return genericError(request, 404);
    logRequest(request, "/api/weight/[id]", 204);
    const response = new NextResponse(null, { status: 204 });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    if (error instanceof UnauthorizedError) return genericError(request, 401);
    console.error("weight_delete_failed", { status: 500 });
    return genericError(request, 500);
  }
}
