import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/server/auth";
import { removeWeightEntry, updateWeightEntry } from "@/server/weight";
import { weightInput } from "@/lib/validations/weight";
import { uuid } from "@/lib/validations/common";
import { z } from "zod";
import { logRequest } from "@/server/logger";
import { isSameOrigin } from "@/server/same-origin";

export const runtime = "nodejs";

function genericError(request: Request, status: number) {
  logRequest(request, "/api/weight/[id]", status);
  const response = NextResponse.json({ error: "Request could not be completed." }, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function isUniqueViolation(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; cause?: { code?: unknown } };
  return candidate.code === "23505" || candidate.cause?.code === "23505";
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") {
    return genericError(request, 415);
  }
  if (!isSameOrigin(request)) return genericError(request, 403);

  try {
    const userId = await requireUser();
    const { id } = await context.params;
    if (!uuid.safeParse(id).success) return genericError(request, 404);
    const body = weightInput.parse(await request.json());
    const entry = await updateWeightEntry(userId, id, body.date, body.kilograms);
    if (!entry) return genericError(request, 404);
    logRequest(request, "/api/weight/[id]", 200);
    const response = NextResponse.json({ entry });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    if (error instanceof UnauthorizedError) return genericError(request, 401);
    if (error instanceof z.ZodError) return genericError(request, 400);
    if (isUniqueViolation(error)) return genericError(request, 409);
    console.error("weight_update_failed", { status: 500 });
    return genericError(request, 500);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") {
    return genericError(request, 415);
  }
  if (!isSameOrigin(request)) return genericError(request, 403);

  try {
    const userId = await requireUser();
    const { id } = await context.params;
    if (!uuid.safeParse(id).success) return genericError(request, 404);
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
